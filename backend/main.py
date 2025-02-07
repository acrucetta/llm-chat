from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
import anthropic
import os
from dotenv import load_dotenv
import json

load_dotenv()

app = FastAPI()
client = anthropic.Client(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Mount static files and templates
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")

# Production (after building)
# app.mount("/", StaticFiles(directory="frontend/dist"), name="static")

templates = Jinja2Templates(directory="frontend/templates")

# Store active connections
active_connections = []


@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            parsed_data = json.loads(data)
            message = parsed_data["message"]
            chat_id = parsed_data.get("chatId")  # Get chat ID from client

            # Start streaming response
            message_stream = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1024,
                messages=[{"role": "user", "content": message}],
                stream=True,
            )

            # Initialize complete response for history
            complete_response = ""

            # Stream the response back to the client
            for chunk in message_stream:
                if chunk.type == "content_block_delta":
                    complete_response += chunk.delta.text
                    await websocket.send_text(
                        json.dumps({
                            "type": "stream",
                            "content": chunk.delta.text,
                            "chatId": chat_id
                        })
                    )

            # Send completion message with full response for history
            await websocket.send_text(
                json.dumps({
                    "type": "complete",
                    "chatId": chat_id,
                    "fullResponse": complete_response
                })
            )

    except WebSocketDisconnect:
        active_connections.remove(websocket)
