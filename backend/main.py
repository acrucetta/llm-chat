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
            message = await websocket.receive_text()
            
            # Start streaming response
            message_stream = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1024,
                messages=[{"role": "user", "content": message}],
                stream=True
            )
            
            # Stream the response back to the client
            for chunk in message_stream:
                if chunk.type == "content_block_delta":
                    await websocket.send_text(json.dumps({
                        "type": "stream",
                        "content": chunk.delta.text
                    }))
            
            # Send completion message
            await websocket.send_text(json.dumps({
                "type": "complete"
            }))
            
    except WebSocketDisconnect:
        active_connections.remove(websocket) 