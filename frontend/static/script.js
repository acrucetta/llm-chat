let ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
let currentMessage = '';
let currentConversationId = null;

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

async function handleSubmit() {
    const message = userInput.value.trim();
    if (!message) return;
    
    // Create new conversation if none exists
    if (!currentConversationId) {
        await createNewConversation();
    }
    
    const payload = {
        message: message,
        model: modelSelect.value,
        conversationId: currentConversationId
    };
    
    addMessage(message, true);
    ws.send(JSON.stringify(payload));
    userInput.value = '';
    currentMessage = '';
    
    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'message assistant-message';
    messagesDiv.appendChild(assistantDiv);
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

async function loadConversations() {
    try {
        const response = await fetch('/api/conversations');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const conversations = await response.json();
        const conversationList = document.getElementById('conversation-list');
        conversationList.innerHTML = '';
        
        if (conversations.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = 'No conversations yet';
            conversationList.appendChild(emptyState);
            return;
        }
        
        conversations.forEach(conv => {
            const convDiv = document.createElement('div');
            convDiv.className = `conversation-item ${conv.id === currentConversationId ? 'active' : ''}`;
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = conv.title || `Chat ${new Date(conv.created_at).toLocaleString()}`;
            titleSpan.className = 'conversation-title';
            
            const deleteButton = document.createElement('button');
            deleteButton.textContent = '×';
            deleteButton.className = 'delete-conversation';
            deleteButton.onclick = (e) => deleteConversation(conv.id, e);
            
            convDiv.appendChild(titleSpan);
            convDiv.appendChild(deleteButton);
            convDiv.onclick = () => switchConversation(conv.id);
            
            conversationList.appendChild(convDiv);
        });
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

async function createNewConversation() {
    const title = `Chat ${new Date().toLocaleString()}`;
    try {
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: title })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const conversation = await response.json();
        currentConversationId = conversation.id;
        await loadConversations();
        clearChat();
    } catch (error) {
        console.error('Error creating conversation:', error);
    }
}

function clearChat() {
    const messagesDiv = document.getElementById('chat-messages');
    messagesDiv.innerHTML = '';
    currentMessage = '';
}

async function switchConversation(conversationId) {
    currentConversationId = conversationId;
    await loadConversations();
    await loadConversationMessages(conversationId);
}

async function loadConversationMessages(conversationId) {
    const response = await fetch(`/api/conversations/${conversationId}/messages`);
    const messages = await response.json();
    
    clearChat();
    
    messages.forEach(msg => {
        addMessage(msg.content, msg.role === 'user');
    });
}

function deleteConversation(conversationId, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE'
    });
    
    if (currentConversationId === conversationId) {
        currentConversationId = null;
        clearChat();
    }
    loadConversations();
}

document.getElementById('new-chat-button').addEventListener('click', createNewConversation);

loadConversations(); 