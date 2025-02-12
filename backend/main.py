from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Body
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import anthropic
import openai
import os
from dotenv import load_dotenv
import json
from collections import defaultdict
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models.conversations import Base, Conversation, Message

load_dotenv()

app = FastAPI()
client = anthropic.Client(api_key=os.getenv("ANTHROPIC_API_KEY"))
openai_client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))

# Mount static files and templates
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
templates = Jinja2Templates(directory="frontend/templates")

# Store active connections
active_connections = []
chat_histories = defaultdict(list)  # Store message histories by websocket

DATABASE_URL = "sqlite:///./chat.db"
MAX_TOKENS = 2048
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    chat_histories[websocket] = []

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            message = payload["message"]
            model = payload["model"]
            conversation_id = payload.get("conversationId")

            db = SessionLocal()

            # Save user message
            user_message = Message(
                conversation_id=conversation_id, role="user", content=message
            )
            db.add(user_message)
            db.commit()

            # Get conversation history from database
            history = (
                db.query(Message)
                .filter(Message.conversation_id == conversation_id)
                .order_by(Message.created_at)
                .all()
            )

            # Format messages for Claude API
            context_window = [
                {"role": msg.role, "content": msg.content}
                for msg in history[-10:]  # Last 10 messages
            ]

            if model.startswith("claude"):
                message_stream = client.messages.create(
                    model=model,
                    max_tokens=MAX_TOKENS,
                    messages=context_window,
                    stream=True,
                )

                full_response = ""
                for chunk in message_stream:
                    if chunk.type == "content_block_delta":
                        full_response += chunk.delta.text
                        await websocket.send_text(
                            json.dumps({"type": "stream", "content": chunk.delta.text})
                        )

                # Save assistant message
                assistant_message = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                )
                db.add(assistant_message)
                db.commit()

            elif model.startswith("gpt") or model.startswith("o1"):
                message_stream = openai_client.chat.completions.create(
                    model=model,
                    max_completion_tokens=MAX_TOKENS,
                    messages=context_window,
                    stream=True,
                )

                full_response = ""
                for chunk in message_stream:
                    if chunk.choices[0].delta.content is not None:
                        full_response += chunk.choices[0].delta.content
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "stream",
                                    "content": chunk.choices[0].delta.content,
                                }
                            )
                        )

                # Save assistant message
                assistant_message = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                )
                db.add(assistant_message)
                db.commit()

            db.close()

    except WebSocketDisconnect:
        active_connections.remove(websocket)
        del chat_histories[websocket]


@app.get("/api/conversations")
async def get_conversations():
    db = SessionLocal()
    result = [
        {"id": c.id, "title": c.title, "created_at": c.created_at}
        for c in db.query(Conversation).all()
    ]
    db.close()
    return result


@app.post("/api/conversations")
async def create_conversation(title: str = Body(..., embed=True)):
    db = SessionLocal()
    conversation = Conversation(title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    result = {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
    }
    db.close()
    return result


@app.get("/api/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int):
    db = SessionLocal()
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
        .all()
    )
    db.close()
    return messages


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int):
    db = SessionLocal()
    # Delete messages first due to foreign key constraint
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.query(Conversation).filter(Conversation.id == conversation_id).delete()
    db.commit()
    db.close()
    return {"status": "success"}
