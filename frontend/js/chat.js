import { db, ChatDB } from './db.js';

export class Chat {
    constructor() {
        this.ws = null;
        this.currentChatId = null;
        this.messageQueue = '';

        this.initializeWebSocket();
        this.setupEventListeners();
        this.loadChatHistory();
    }

    async initializeWebSocket() {
        this.ws = new WebSocket(`ws://${window.location.host}/ws/chat`);

        this.ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'stream') {
                this.messageQueue += data.content;
                this.updateStreamingMessage(this.messageQueue);
            } else if (data.type === 'complete') {
                // Save the complete message to IndexedDB
                await ChatDB.addMessage(
                    this.currentChatId,
                    'assistant',
                    data.fullResponse
                );
                this.messageQueue = '';
                this.loadChatMessages(this.currentChatId);
            }
        };
    }

    async setupEventListeners() {
        // New chat button
        document.getElementById('new-chat').addEventListener('click', async () => {
            this.currentChatId = await ChatDB.createChat();
            this.loadChatMessages(this.currentChatId);
            this.updateChatList();
        });

        // Send message form
        document.getElementById('chat-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input');
            const message = input.value.trim();

            if (message) {
                if (!this.currentChatId) {
                    this.currentChatId = await ChatDB.createChat();
                }

                // Save user message to IndexedDB
                await ChatDB.addMessage(this.currentChatId, 'user', message);

                // Get chat history
                const chatHistory = await ChatDB.getChatMessages(this.currentChatId);
                const formattedHistory = chatHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }));

                // Send message and history through WebSocket
                this.ws.send(JSON.stringify({
                    message,
                    chatId: this.currentChatId,
                    history: formattedHistory
                }));

                input.value = '';
                this.loadChatMessages(this.currentChatId);
            }
        });
    }

    async loadChatHistory() {
        const chats = await ChatDB.getAllChats();
        const chatList = document.getElementById('chat-list');
        chatList.innerHTML = '';

        chats.forEach(chat => {
            const chatElement = document.createElement('div');
            chatElement.className = 'chat-item';
            chatElement.textContent = chat.title;
            chatElement.addEventListener('click', () => {
                this.loadChatMessages(chat.id);
            });
            chatList.appendChild(chatElement);
        });
    }

    async loadChatMessages(chatId) {
        const messages = await ChatDB.getChatMessages(chatId);
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = '';

        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.role}`;
            messageElement.textContent = message.content;
            chatContainer.appendChild(messageElement);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    updateStreamingMessage(content) {
        const chatContainer = document.getElementById('chat-messages');
        const streamingMessage = document.querySelector('.message.streaming') || (() => {
            const div = document.createElement('div');
            div.className = 'message assistant streaming';
            chatContainer.appendChild(div);
            return div;
        })();

        streamingMessage.textContent = content;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}