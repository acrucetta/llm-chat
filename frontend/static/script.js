let ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
let currentMessage = '';

const messagesDiv = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const modelSelect = document.getElementById('model-select');

function isUserAtBottom(element, threshold = 100) {
    return element.scrollHeight - element.clientHeight - element.scrollTop <= threshold;
}

function addMessage(content, isUser = false) {
    const wasAtBottom = isUserAtBottom(messagesDiv);
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    if (isUser) {
        messageDiv.textContent = content;
    } else {
        // Parse markdown and sanitize HTML
        const htmlContent = marked.parse(content, {
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            }
        });
        messageDiv.innerHTML = DOMPurify.sanitize(htmlContent);
    }
    
    messagesDiv.appendChild(messageDiv);
    if (wasAtBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function handleSubmit() {
    const message = userInput.value.trim();
    if (message) {
        const payload = {
            message: message,
            model: modelSelect.value
        };
        
        addMessage(message, true);
        ws.send(JSON.stringify(payload));
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
    const wasAtBottom = isUserAtBottom(messagesDiv);
    
    if (data.type === 'stream') {
        currentMessage += data.content;
        if (lastMessage) {
            // Parse markdown for streaming content
            lastMessage.innerHTML = marked.parse(currentMessage, {
                highlight: function(code, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return hljs.highlightAuto(code).value;
                }
            });
        }
        if (wasAtBottom) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }
};

sendButton.addEventListener('click', handleSubmit);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
}); 