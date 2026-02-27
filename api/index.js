// api/index.js
const express = require('express');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const app = express();

// Middleware untuk membaca JSON
app.use(express.json());

// 1. Konfigurasi Email (Ambil dari Environment Variables Vercel)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER, // JANGAN TULIS EMAIL DISINI
        pass: process.env.GMAIL_APP_PASSWORD // JANGAN TULIS PASS DISINI
    }
});

// 2. Endpoint Webhook (Dipanggil oleh Google Apps Script)
app.post('/webhook', async (req, res) => {
    try {
        const { nama, email, eventName } = req.body;

        // Validasi input
        if (!email || !nama) {
            return res.status(400).json({ 
                success: false, 
                message: 'Data tidak lengkap. Butuh nama dan email.' 
            });
        }

        console.log(`Processing ticket for: ${nama} (${email})`);

        // Generate QR Code
        const ticketData = JSON.stringify({ 
            nama, 
            email, 
            event: eventName, 
            timestamp: new Date().toISOString() 
        });
        const qrCodeUrl = await QRCode.toDataURL(ticketData);

        // Template Email HTML
        const htmlContent = `
            <div style="font-family: sans-serif; border: 1px solid #ccc; padding: 20px; border-radius: 8px; max-width: 500px;">
                <h2 style="color: #2c3e50;">Tiket Event: ${eventName || 'Webinar'}</h2>
                <p>Halo <strong>${nama}</strong>,</p>
                <p>Terima kasih sudah mendaftar. Tunjukkan QR Code ini saat registrasi ulang:</p>
                <div style="text-align: center; margin: 20px 0;">
                    <img src="${qrCodeUrl}" alt="QR Code Tiket" style="width: 200px;" />
                </div>
                <p style="font-size: 0.8rem; color: #7f8c8d;">Tiket ini dikirim otomatis oleh sistem.</p>
            </div>
        `;

        // Kirim Email
        await transporter.sendMail({
            from: `"Panitia Event" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: `Tiket Masuk: ${eventName || 'Konfirmasi'}`,
            html: htmlContent
        });

        return res.status(200).json({ success: true, message: 'Email terkirim!' });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Route Default (Untuk Cek Server Hidup)
app.get('/', (req, res) => {
    res.send('Server Tiket Pendaftaran Aktif! 🚀');
});

// PENTING: Export app untuk Vercel
module.exports = app;