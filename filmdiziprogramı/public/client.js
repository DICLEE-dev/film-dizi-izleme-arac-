const socket = io();

// DOM Elementleri
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const displayRoom = document.getElementById('display-room');

const videoUrlInput = document.getElementById('video-url-input');
const loadVideoBtn = document.getElementById('load-video-btn');
const html5Player = document.getElementById('html5-player');
const ytContainer = document.getElementById('youtube-player');

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

let currentRoom = '';
let currentVideoType = 'mp4';
let ytPlayer = null;
let isRemoteAction = false; // Sunucudan gelen komutlarda tekrar tetiklemeyi önler

// YouTube API Hazır Olduğunda
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        events: {
            'onStateChange': onYtStateChange
        }
    });
}

// Odaya Katıl
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!username || !roomId) {
        alert('Lütfen adınızı ve oda kodunu girin!');
        return;
    }

    currentRoom = roomId;
    displayRoom.textContent = roomId;
    loginScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');

    socket.emit('join-room', { roomId, username });
});

// YouTube Video ID Ayıklayıcı
function extractYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Yeni Video Yükle Butonu
loadVideoBtn.addEventListener('click', () => {
    const url = videoUrlInput.value.trim();
    if (!url) return;

    const ytId = extractYouTubeID(url);
    const videoType = ytId ? 'youtube' : 'mp4';
    const finalUrl = ytId ? ytId : url;

    socket.emit('change-video', {
        roomId: currentRoom,
        videoUrl: finalUrl,
        videoType
    });
    videoUrlInput.value = '';
});

// Oynatıcıyı Ekrana Yerleştir
function loadMedia(videoUrl, videoType) {
    currentVideoType = videoType;
    isRemoteAction = true;

    if (videoType === 'youtube') {
        html5Player.pause();
        html5Player.classList.add('hidden');
        ytContainer.classList.remove('hidden');
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(videoUrl);
        }
    } else {
        if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
        ytContainer.classList.add('hidden');
        html5Player.classList.remove('hidden');
        html5Player.src = videoUrl;
    }

    setTimeout(() => { isRemoteAction = false; }, 500);
}

// HTML5 Video Olayları
html5Player.addEventListener('play', () => {
    if (isRemoteAction) return;
    socket.emit('video-action', {
        roomId: currentRoom,
        action: 'play',
        currentTime: html5Player.currentTime
    });
});

html5Player.addEventListener('pause', () => {
    if (isRemoteAction) return;
    socket.emit('video-action', {
        roomId: currentRoom,
        action: 'pause',
        currentTime: html5Player.currentTime
    });
});

html5Player.addEventListener('seeked', () => {
    if (isRemoteAction) return;
    socket.emit('video-action', {
        roomId: currentRoom,
        action: 'seek',
        currentTime: html5Player.currentTime
    });
});

// YouTube Olayları
function onYtStateChange(event) {
    if (isRemoteAction) return;
    const currentTime = ytPlayer.getCurrentTime();

    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('video-action', { roomId: currentRoom, action: 'play', currentTime });
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('video-action', { roomId: currentRoom, action: 'pause', currentTime });
    }
}

// Sunucudan Gelen Senkronizasyon Olayları
socket.on('sync-state', (state) => {
    loadMedia(state.videoUrl, state.videoType);
    setTimeout(() => {
        isRemoteAction = true;
        if (state.videoType === 'mp4') {
            html5Player.currentTime = state.currentTime;
            if (state.isPlaying) html5Player.play();
        } else if (ytPlayer && ytPlayer.seekTo) {
            ytPlayer.seekTo(state.currentTime, true);
            if (state.isPlaying) ytPlayer.playVideo();
        }
        setTimeout(() => { isRemoteAction = false; }, 500);
    }, 1000);
});

socket.on('video-changed', ({ videoUrl, videoType }) => {
    loadMedia(videoUrl, videoType);
});

socket.on('video-action', ({ action, currentTime }) => {
    isRemoteAction = true;

    if (currentVideoType === 'mp4') {
        if (Math.abs(html5Player.currentTime - currentTime) > 1) {
            html5Player.currentTime = currentTime;
        }
        if (action === 'play') html5Player.play();
        if (action === 'pause') html5Player.pause();
    } else if (currentVideoType === 'youtube' && ytPlayer) {
        if (Math.abs(ytPlayer.getCurrentTime() - currentTime) > 1.5) {
            ytPlayer.seekTo(currentTime, true);
        }
        if (action === 'play') ytPlayer.playVideo();
        if (action === 'pause') ytPlayer.pauseVideo();
    }

    setTimeout(() => { isRemoteAction = false; }, 500);
});

// Sohbet Gönderme ve Alma
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    socket.emit('chat-message', { roomId: currentRoom, message });
    chatInput.value = '';
});

socket.on('chat-message', ({ username, message, isSystem }) => {
    const div = document.createElement('div');
    div.className = isSystem ? 'msg system' : 'msg';
    div.innerHTML = isSystem ? message : `<strong>${username}</strong>${message}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});