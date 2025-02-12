let ws = new WebSocket(`ws://${window.location.host}/ws/chat`);
let currentMessage = '';
let currentConversationId = null;
let isGenerating = false;

const messagesDiv = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const stopButton = document.getElementById('stop-button');
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
            highlight: function (code, lang) {
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


stopButton.addEventListener('click', async () => {
    try {
        ws.send(JSON.stringify({ type: 'stop' }));
    } catch (error) {
        console.error('Error stopping generation:', error);
    }
});

async function handleSubmit() {
    const message = userInput.value.trim();
    if (!message || isGenerating) return;

    try {
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
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

ws.onmessage = function (event) {
    try {
        const data = JSON.parse(event.data);
        const lastMessage = messagesDiv.lastElementChild;
        const wasAtBottom = isUserAtBottom(messagesDiv);

        if (data.type === 'stream') {
            currentMessage += data.content;
            if (lastMessage) {
                lastMessage.innerHTML = DOMPurify.sanitize(marked.parse(currentMessage));
            }
            if (wasAtBottom) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        } else if (data.type === 'end') {
            if (lastMessage && currentMessage) {
                lastMessage.innerHTML = DOMPurify.sanitize(marked.parse(currentMessage));
            }
        } else if (data.type === 'error') {
            console.error('Server error:', data.content);
            addMessage('Error: ' + data.content, false);
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
};

sendButton.addEventListener('click', handleSubmit);
userInput.addEventListener('keypress', (e) => {
    if ((e.key === 'Enter' || e.key === 'Return') && !e.shiftKey) {
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

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const mainChat = document.getElementById("chat-container");

    // Toggle the collapsed class
    sidebar.classList.toggle('collapsed');
    mainChat.classList.toggle('collapsed');
}

async function switchConversation(conversationId) {
    try {
        currentConversationId = conversationId;
        await loadConversations();
        await loadConversationMessages(conversationId);
    } catch (error) {
        console.error('Error switching conversation:', error);
    }
}

async function loadConversationMessages(conversationId) {
    try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const messages = await response.json();

        clearChat();

        messages.forEach(msg => {
            addMessage(msg.content, msg.role === 'user');
        });
    } catch (error) {
        console.error('Error loading conversation messages:', error);
    }
}

async function deleteConversation(conversationId, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        await loadConversations();
        clearChat();
    } catch (error) {
        console.error('Error deleting conversation:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
});