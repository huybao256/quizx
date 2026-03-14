/**
 * QuizX Real-time Chat & AI Tutor Logic
 */

let isChatOpen = false;
let activeFriendEmail = null;
let activeChatId = null;
let chatUnsubscribe = null;

function toggleChatWidget() {
    const panel = document.getElementById('chat-widget-panel');
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
        panel.classList.add('chat-open');
    } else {
        panel.classList.remove('chat-open');
    }
    if (window.lucide) lucide.createIcons();
}

function switchChatTab(tab) {
    const aiArea = document.getElementById('chat-area-ai');
    const friendsArea = document.getElementById('chat-area-friends');
    const aiTabBtn = document.getElementById('tab-chat-ai');
    const friendsTabBtn = document.getElementById('tab-chat-friends');

    if (tab === 'ai') {
        aiArea.classList.remove('hidden');
        friendsArea.classList.add('hidden');
        
        aiTabBtn.className = "flex-1 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-white shadow-sm text-indigo-600 transition-all";
        friendsTabBtn.className = "flex-1 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg text-gray-500 hover:text-gray-800 transition-all";
    } else {
        aiArea.classList.add('hidden');
        friendsArea.classList.remove('hidden');
        
        friendsTabBtn.className = "flex-1 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-white shadow-sm text-blue-600 transition-all";
        aiTabBtn.className = "flex-1 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg text-gray-500 hover:text-gray-800 transition-all";
    }
}

function encodeUserEmail(email) {
    return email.replace(/\./g, ',');
}

function openFriendChat(name, email) {
    document.getElementById('friend-list-view').classList.add('hidden');
    document.getElementById('friend-chat-view').classList.remove('hidden');
    document.getElementById('active-friend-name').innerText = name;
    
    activeFriendEmail = email;
    const currentUser = localStorage.getItem('currentUser');
    
    if (currentUser) {
        // Create a unique chat ID based on two emails (alphabetical order)
        const emails = [encodeUserEmail(currentUser), encodeUserEmail(email)].sort();
        activeChatId = `chat_${emails[0]}_${emails[1]}`;
        listenToMessages(activeChatId);
    } else {
        showToast('Vui lòng đăng nhập để chat!', 'error');
    }
}

function closeFriendChat() {
    document.getElementById('friend-chat-view').classList.add('hidden');
    document.getElementById('friend-list-view').classList.remove('hidden');
    
    // Stop listening to previous chat
    activeChatId = null;
    activeFriendEmail = null;
}

function listenToMessages(chatId) {
    const container = document.getElementById('friend-chat-messages');
    container.innerHTML = '<div class="text-center text-xs text-gray-400 my-2 italic">Đang tải tin nhắn...</div>';
    
    if (!window.firebaseDB) return;

    const chatRef = window.fbRef(window.firebaseDB, `direct_chats/${chatId}/messages`);
    
    // In a real app, we would store the unsubscribe function if using onSnapshot/onValue
    window.fbOnValue(chatRef, (snapshot) => {
        if (activeChatId !== chatId) return; // Guard against race conditions
        
        const messages = snapshot.val();
        container.innerHTML = '';
        
        if (!messages) {
            container.innerHTML = '<div class="text-center text-xs text-gray-400 my-2 italic">Chưa có tin nhắn nào. Hãy chào nhau đi! 👋</div>';
            return;
        }

        const currentUser = localStorage.getItem('currentUser');
        
        Object.keys(messages).forEach(msgId => {
            const msg = messages[msgId];
            const isMe = msg.sender === currentUser;
            
            const msgHTML = `
                <div class="flex gap-3 ${isMe ? 'self-end justify-end' : 'self-start'} w-full">
                    ${!isMe ? `<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">${msg.sender.substring(0, 1).toUpperCase()}</div>` : ''}
                    <div class="${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'} p-3 rounded-2xl max-w-[80%] whitespace-pre-wrap">${msg.text}</div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', msgHTML);
        });
        
        container.scrollTop = container.scrollHeight;
    });
}

async function sendChatMessage(type) {
    const inputEl = document.getElementById(type === 'ai' ? 'ai-chat-input' : 'friend-chat-input');
    const msg = inputEl.value.trim();
    if (!msg) return;

    if (type === 'ai') {
        await handleAIChat(msg);
    } else {
        await handleFriendChat(msg);
    }
    
    inputEl.value = '';
}

async function handleFriendChat(text) {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser || !activeChatId) {
        showToast('Lỗi gửi tin nhắn!', 'error');
        return;
    }

    if (!window.firebaseDB) {
        showToast('Chưa kết nối Firebase!', 'error');
        return;
    }

    const messagesRef = window.fbRef(window.firebaseDB, `direct_chats/${activeChatId}/messages`);
    const newMsgRef = window.fbPush(messagesRef);
    
    await window.fbSet(newMsgRef, {
        sender: currentUser,
        text: text,
        timestamp: Date.now()
    });
}

async function handleAIChat(msg) {
    const container = document.getElementById('ai-chat-messages');
    
    // Append User Message
    const userMsgHTML = `
        <div class="flex gap-3 self-end justify-end w-full">
            <div class="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none max-w-[80%]">${msg}</div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', userMsgHTML);
    container.scrollTop = container.scrollHeight;

    let apiKey = document.getElementById('ai-api-key')?.value.trim();
    if (!apiKey) {
        apiKey = localStorage.getItem('gemini_api_key');
    }
    
    if (!apiKey) {
        appendAIMessage("Lỗi: Vui lòng dán Gemini API Key trong phần Deck Studio (nút AI Auto) để sử dụng tính năng này.");
        return;
    }
    
    // Save it if we haven't already
    localStorage.setItem('gemini_api_key', apiKey);

    // Show Loading
    const loadingId = 'loading-' + Date.now();
    container.insertAdjacentHTML('beforeend', `
        <div id="${loadingId}" class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="bot" size="16"></i></div>
            <div class="bg-gray-100 text-gray-800 p-3 rounded-2xl rounded-tl-none flex items-center gap-1">
                <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            </div>
        </div>
    `);
    container.scrollTop = container.scrollHeight;
    if (window.lucide) lucide.createIcons();

    try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: "You are a helpful study tutor. Answer concisely and politely in Vietnamese. Context: QuizX platform. The student asks: " + msg }]
                }]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Gemini API Error:', data);
            const errMsg = data.error?.message || 'API Error';
            throw new Error(errMsg);
        }

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            const aiReply = data.candidates[0].content.parts[0].text;
            document.getElementById(loadingId).remove();
            appendAIMessage(aiReply.replace(/\n/g, '<br>'));
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
            throw new Error('Nội dung bị chặn bởi AI: ' + data.promptFeedback.blockReason);
        } else {
            console.warn('Unexpected Gemini Response Structure:', data);
            throw new Error('Cấu trúc phản hồi không mong muốn từ AI.');
        }

    } catch (error) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        console.error('AIChat Error Detail:', error);
        appendAIMessage("Lỗi: " + error.message);
    }
}

function appendAIMessage(text) {
    const container = document.getElementById('ai-chat-messages');
    const aiMsgHTML = `
        <div class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="bot" size="16"></i></div>
            <div class="bg-gray-100 text-gray-800 p-3 rounded-2xl rounded-tl-none max-w-[80%]">
                ${text}
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', aiMsgHTML);
    container.scrollTop = container.scrollHeight;
    if (window.lucide) lucide.createIcons();
}
