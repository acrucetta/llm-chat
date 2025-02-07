import Dexie from 'dexie';

export const db = new Dexie('llmchat');

// Define database schema
db.version(1).stores({
  chats: '++id, title, createdAt',
  messages: '++id, chatId, role, content, timestamp'
});

// Utility functions for chat operations
export const ChatDB = {
  async createChat(title = 'New Chat') {
    const chatId = await db.chats.add({
      title,
      createdAt: new Date().toISOString()
    });
    return chatId;
  },

  async getChat(chatId) {
    return await db.chats.get(chatId);
  },

  async getChatMessages(chatId) {
    return await db.messages
      .where('chatId')
      .equals(chatId)
      .sortBy('timestamp');
  },

  async addMessage(chatId, role, content) {
    return await db.messages.add({
      chatId,
      role,
      content,
      timestamp: new Date().toISOString()
    });
  },

  async getAllChats() {
    return await db.chats
      .orderBy('createdAt')
      .reverse()
      .toArray();
  }
};
