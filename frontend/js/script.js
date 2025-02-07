let ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
let currentMessage = '';

const messagesDiv = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    messageDiv.textContent = content;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function handleSubmit() {
    const message = userInput.value.trim();
    if (message) {
        addMessage(message, true);
        ws.send(message);
        userInput.value = '';
        currentMessage = '';
        
        // Create a new div for the assistant's response
        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'message assistant-message';
        messagesDiv.appendChild(assistantDiv);
    }
}

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    const lastMessage = messagesDiv.lastElementChild;
    
    if (data.type === 'stream') {
        currentMessage += data.content;
        lastMessage.textContent = currentMessage;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
};

sendButton.addEventListener('click', handleSubmit);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
}); 