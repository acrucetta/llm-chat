from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
import anthropic
import openai
import os
from dotenv import load_dotenv
import json
from collections import defaultdict

load_dotenv()

app = FastAPI()
client = anthropic.Client(api_key=os.getenv("ANTHROPIC_API_KEY"))
openai_client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))

# Mount static files and templates
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
templates = Jinja2Templates(directory="frontend/templates")

# Store active connections
active_connections = []
chat_histories = defaultdict()  # Store message histories by websocket

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
            message = payload['message']
            model = payload['model']
            
            # Add user message to history
            chat_histories[websocket].append({"role": "user", "content": message})
            
            # Get last N messages for context
            context_window = chat_histories[websocket][-10:]
            
            if model.startswith('claude'):
                # Existing Claude logic
                message_stream = client.messages.create(
                    model=model,
                    max_tokens=1024,
                    messages=context_window,
                    stream=True
                )
                
                full_response = ""
                for chunk in message_stream:
                    if chunk.type == "content_block_delta":
                        full_response += chunk.delta.text
                        await websocket.send_text(json.dumps({
                            "type": "stream",
                            "content": chunk.delta.text
                        }))
            
            else:  # OpenAI models
                # Convert context format for OpenAI
                openai_messages = [
                    {"role": msg["role"], "content": msg["content"]} 
                    for msg in context_window
                ]
                
                stream = openai_client.chat.completions.create(
                    model=model,
                    messages=openai_messages,
                    stream=True
                )
                
                full_response = ""
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        await websocket.send_text(json.dumps({
                            "type": "stream",
                            "content": content
                        }))
            
            # Add assistant's response to history
            chat_histories[websocket].append({"role": "assistant", "content": full_response})
            
            # Send completion message
            await websocket.send_text(json.dumps({
                "type": "complete"
            }))
            
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        del chat_histories[websocket] 