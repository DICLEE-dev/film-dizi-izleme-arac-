const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Oda durumlarını hafızada tut
const rooms = {};

io.on('connection', (socket) => {
    console.log(`Yeni bağlantı: ${socket.id}`);

    // Odaya katılma
    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.username = username || 'Misafir';

        if (!rooms[roomId]) {
            rooms[roomId] = {
                videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                videoType: 'mp4',
                isPlaying: false,
                currentTime: 0
            };
        }

        // Yeni katılan kişiye mevcut oda durumunu gönder
        socket.emit('sync-state', rooms[roomId]);

        // Odadaki diğer kişilere bildirim gönder
        socket.to(roomId).emit('chat-message', {
            username: 'Sistem',
            message: `${socket.username} odaya katıldı.`,
            isSystem: true
        });
    });

    // Video URL değiştirme
    socket.on('change-video', ({ roomId, videoUrl, videoType }) => {
        if (rooms[roomId]) {
            rooms[roomId].videoUrl = videoUrl;
            rooms[roomId].videoType = videoType;
            rooms[roomId].currentTime = 0;
            rooms[roomId].isPlaying = false;
            io.to(roomId).emit('video-changed', { videoUrl, videoType });
        }
    });

    // Video Oynat / Duraklat / İleri Sar senkronizasyonu
    socket.on('video-action', ({ roomId, action, currentTime }) => {
        if (rooms[roomId]) {
            rooms[roomId].currentTime = currentTime;
            if (action === 'play') rooms[roomId].isPlaying = true;
            if (action === 'pause') rooms[roomId].isPlaying = false;

            // İşlemi yapan hariç odadaki herkese gönder
            socket.to(roomId).emit('video-action', { action, currentTime });
        }
    });

    // Sohbet mesajı
    socket.on('chat-message', ({ roomId, message }) => {
        io.to(roomId).emit('chat-message', {
            username: socket.username,
            message,
            isSystem: false
        });
    });

    // Bağlantı koptuğunda
    socket.on('disconnect', () => {
        if (socket.roomId && socket.username) {
            socket.to(socket.roomId).emit('chat-message', {
                username: 'Sistem',
                message: `${socket.username} odadan ayrıldı.`,
                isSystem: true
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor...`);
});