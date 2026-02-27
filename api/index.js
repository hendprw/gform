const express = require('express');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const qr = require('qr-image');
const ics = require('ics');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(express.json());

// ==========================================
// 1. KONFIGURASI (Environment Variables)
// ==========================================
const FONNTE_TOKEN = process.env.FONNTE_TOKEN; // Masukkan token Fonnte di Vercel Env
const GMAIL_USER = process.env.GMAIL_USER;     // Email pengirim
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD; // App Password Gmail

// Detail Event
const EVENT = {
    title: "Ramadhan Impact Day 2026",
    location: "Lab TIA, Teknik Informatika (Eksak lt.3)",
    dateString: "8 Maret 2026",
    timeString: "15:00 - 18:00 WIB",
    // Format tanggal ICS: [Tahun, Bulan, Tanggal, Jam, Menit]
    icsDate: [2026, 3, 8, 15, 0], 
    duration: { hours: 3, minutes: 0 },
    logoUrl: "https://i.ibb.co.com/6cxn98gN/Desain-tanpa-judul-18-1.png", // Logo opsional
    organizerName: "Koalisi Community",
    organizerEmail: "admin@koalisi.info"
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Helper: Format Nomor HP (08xx -> 628xx) untuk WhatsApp
function formatPhoneNumber(number) {
    if (!number) return '';
    let formatted = number.toString().replace(/\D/g, ''); // Hapus semua karakter non-angka
    
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.slice(1);
    } else if (formatted.startsWith('8')) {
        formatted = '62' + formatted;
    }
    
    return formatted;
}

// Helper: Generate PDF menjadi Buffer (In-Memory)
function generatePDFBuffer(docCallback) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            let buffers = [];
            
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
            
            // Eksekusi desain PDF
            docCallback(doc);
            
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

// Helper: Kirim WhatsApp via Fonnte
async function sendWhatsappFonnte(target, message, fileBuffer, filename) {
    try {
        if (!FONNTE_TOKEN) {
            console.log("❌ Token Fonnte belum diset.");
            return;
        }

        const form = new FormData();
        form.append('target', formatPhoneNumber(target));
        form.append('message', message);
        
        // Jika ada file PDF yang mau dikirim
        if (fileBuffer && filename) {
            form.append('file', fileBuffer, { filename: filename });
        }

        const config = {
            method: 'post',
            url: 'https://api.fonnte.com/send',
            headers: { 
                'Authorization': FONNTE_TOKEN, 
                ...form.getHeaders()
            },
            data: form
        };

        const response = await axios(config);
        console.log(`✅ WhatsApp terkirim ke ${target}:`, response.data.status);
        return response.data;
    } catch (error) {
        console.error("❌ Gagal kirim WhatsApp:", error.response ? error.response.data : error.message);
        return null;
    }
}

// ==========================================
// 3. ROUTE UTAMA (WEBHOOK)
// ==========================================
app.post('/webhook', async (req, res) => {
    try {
        // Menerima data dari Google Sheets (Apps Script)
        const { nama, email, noHp } = req.body;

        // Validasi minimal
        if (!email || !nama) {
            return res.status(400).json({ 
                success: false, 
                message: 'Data Nama atau Email tidak ditemukan dalam request.' 
            });
        }

        console.log(`📩 Memproses data: ${nama} | Email: ${email} | WA: ${noHp}`);

        // ---------------------------------------------------------
        // A. GENERATE ASSETS (KODE UNIK, QR, PDF, ICS)
        // ---------------------------------------------------------

        // 1. Buat Kode Tiket Unik
        const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const ticketCode = `RID26-${uniqueId}`;

        // 2. Generate QR Code Image (Buffer)
        const qrBuffer = qr.imageSync(ticketCode, { type: 'png', margin: 1 });
        const qrBase64Public = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${ticketCode}`;

        // 3. Desain PDF TIKET (Lengkap)
        const ticketPdfBuffer = await generatePDFBuffer((doc) => {
            // Background Header Biru Gelap
            doc.rect(0, 0, 612, 250).fill('#0f172a');
            // Garis Aksen Emas
            doc.rect(0, 245, 612, 5).fill('#fbbf24');
            
            // Teks Header
            doc.fillColor('#ffffff').fontSize(10).font('Helvetica').text('OFFICIAL E-TICKET', 50, 40, { characterSpacing: 2 });
            doc.fontSize(28).font('Helvetica-Bold').text(EVENT.title.toUpperCase(), 50, 70, { width: 400 });
            
            // Ticket ID Display
            doc.fontSize(10).font('Helvetica').text('TICKET ID', 50, 180, { opacity: 0.7 });
            doc.fontSize(16).font('Helvetica-Bold').text(`#${ticketCode}`, 50, 195);
            
            // Kotak Putih Konten Utama
            doc.roundedRect(50, 280, 512, 350, 20).fill('#ffffff');
            
            // Info Peserta
            doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('NAMA PESERTA', 80, 310);
            doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text(nama.toUpperCase(), 80, 325);
            
            // Info Waktu
            doc.fillColor('#94a3b8').fontSize(9).text('WAKTU PELAKSANAAN', 80, 375);
            doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(`${EVENT.dateString} | ${EVENT.timeString}`, 80, 390);
            
            // Info Lokasi
            doc.fillColor('#94a3b8').fontSize(9).text('LOKASI', 80, 430);
            doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text(EVENT.location, 80, 445, { width: 300 });
            
            // Tempel QR Code di pojok kanan kotak putih
            doc.image(qrBuffer, 385, 315, { width: 140 });
            
            // Footer Kecil
            doc.fillColor('#94a3b8').fontSize(8).text('Harap tunjukkan QR Code ini di meja registrasi.', 80, 580);
        });

        // 4. Desain PDF KUITANSI (Lengkap)
        const receiptPdfBuffer = await generatePDFBuffer((doc) => {
            // Header Kuitansi
            doc.fontSize(20).font('Helvetica-Bold').fillColor('#0f172a').text('KUITANSI PEMBAYARAN', { align: 'right' });
            doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`No. Ref: RCP-${ticketCode}`, { align: 'right' });
            doc.moveDown();
            
            // Garis Pembatas
            doc.moveTo(50, 120).lineTo(550, 120).lineWidth(2).stroke('#0f172a');
            
            // Info Pembayar & Penerima
            doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold').text('DITERIMA DARI:', 50, 150);
            doc.font('Helvetica').text(nama);
            doc.text(email);
            
            doc.fontSize(12).font('Helvetica-Bold').text('UNTUK ACARA:', 350, 150);
            doc.font('Helvetica').text(EVENT.title);
            doc.text(EVENT.organizerName);
            
            // Tabel Rincian
            doc.rect(50, 230, 500, 30).fill('#f1f5f9');
            doc.fillColor('#0f172a').font('Helvetica-Bold').text('DESKRIPSI', 60, 240);
            doc.text('JUMLAH', 450, 240, { align: 'right', width: 100 });
            
            doc.font('Helvetica').text('Tiket Pendaftaran Event (Regular)', 60, 275);
            doc.text('Rp 0,- (Free)', 450, 275, { align: 'right', width: 100 });
            
            // Total
            doc.moveTo(50, 300).lineTo(550, 300).lineWidth(1).stroke('#e2e8f0');
            doc.fontSize(14).font('Helvetica-Bold').text('TOTAL', 250, 320);
            doc.fontSize(14).fillColor('#2563eb').text('LUNAS', 450, 320, { align: 'right', width: 100 });
            
            // Cap / Stempel
            doc.rect(350, 400, 150, 80).stroke('#e2e8f0');
            doc.fontSize(8).fillColor('#64748b').text('CAP RESMI PANITIA', 350, 490, { align: 'center', width: 150 });
            
            doc.fontSize(10).text(`Tanggal Cetak: ${new Date().toLocaleDateString()}`, 50, 400);
        });

        // 5. Generate File Kalender (.ICS)
        const icsContent = await new Promise((resolve) => {
            const eventAttributes = {
                title: EVENT.title,
                description: `Halo ${nama},\n\nTerima kasih telah mendaftar!\n\nKode Tiket: ${ticketCode}\nLokasi: ${EVENT.location}\n\nSampai jumpa di lokasi acara!\n\n${EVENT.organizerName}`,
                location: EVENT.location,
                start: EVENT.icsDate, // [2026, 3, 8, 15, 0]
                duration: EVENT.duration,
                status: 'CONFIRMED',
                busyStatus: 'BUSY',
                organizer: { name: EVENT.organizerName, email: EVENT.organizerEmail }
            };
            
            ics.createEvent(eventAttributes, (error, value) => {
                if (error) {
                    console.error("Gagal membuat ICS:", error);
                    resolve(null);
                } else {
                    resolve(value);
                }
            });
        });

        // ---------------------------------------------------------
        // B. PROSES PENGIRIMAN (EMAIL & WHATSAPP)
        // ---------------------------------------------------------

        // Setup Transporter Email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_PASS
            }
        });

        // Siapkan Attachments untuk Email
        const attachments = [
            {
                filename: `E-Ticket-${ticketCode}.pdf`,
                content: ticketPdfBuffer,
                contentType: 'application/pdf'
            },
            {
                filename: `Kuitansi-${ticketCode}.pdf`,
                content: receiptPdfBuffer,
                contentType: 'application/pdf'
            }
        ];

        // Tambahkan ICS jika berhasil dibuat
        if (icsContent) {
            attachments.push({
                filename: 'Jadwal_Event.ics',
                content: icsContent,
                contentType: 'text/calendar'
            });
        }

        // 1. Eksekusi Kirim Email
        const sendEmailPromise = transporter.sendMail({
            from: `"${EVENT.organizerName}" <${GMAIL_USER}>`,
            to: email,
            subject: `🎟️ Tiket & Jadwal: ${EVENT.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                    <div style="background-color: #0f172a; padding: 30px; text-align: center;">
                        <h2 style="color: #ffffff; margin: 0;">Pendaftaran Berhasil</h2>
                    </div>
                    <div style="padding: 30px; background-color: #ffffff;">
                        <p style="color: #334155;">Halo <strong>${nama}</strong>,</p>
                        <p style="color: #334155;">Terima kasih telah mendaftar di acara <strong>${EVENT.title}</strong>.</p>
                        
                        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <img src="${qrBase64Public}" alt="QR Code" style="width: 150px; height: 150px; margin-bottom: 10px;">
                            <p style="margin: 0; font-family: monospace; font-size: 18px; font-weight: bold; color: #0f172a;">${ticketCode}</p>
                            <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Tunjukkan QR ini saat registrasi ulang</p>
                        </div>

                        <p style="color: #334155;">Detail Acara:</p>
                        <ul style="color: #334155;">
                            <li>📅 <strong>Tanggal:</strong> ${EVENT.dateString}</li>
                            <li>⏰ <strong>Waktu:</strong> ${EVENT.timeString}</li>
                            <li>📍 <strong>Lokasi:</strong> ${EVENT.location}</li>
                        </ul>
                        <p style="font-size: 13px; color: #64748b;">*Silakan unduh E-Ticket (PDF) dan simpan jadwal (.ics) yang terlampir pada email ini.</p>
                    </div>
                </div>
            `,
            attachments: attachments
        });

        // 2. Eksekusi Kirim WhatsApp (Jika nomor HP ada)
        let sendWaPromise = Promise.resolve(); // Default resolve jika tidak ada HP
        
        if (noHp) {
            const waMessage = `*Halo ${nama}* 👋\n\nSelamat! Pendaftaran Anda untuk *${EVENT.title}* berhasil.\n\n📅 Tanggal: ${EVENT.dateString}\n⏰ Jam: ${EVENT.timeString}\n📍 Lokasi: ${EVENT.location}\n🎟️ Kode Tiket: *${ticketCode}*\n\nBerikut kami lampirkan E-Ticket Anda. Mohon dibawa saat acara berlangsung.\n\nSalam,\n${EVENT.organizerName}`;
            
            // Kirim Pesan + File PDF Tiket
            sendWaPromise = sendWhatsappFonnte(noHp, waMessage, ticketPdfBuffer, `Tiket-${ticketCode}.pdf`);
        }

        // Tunggu kedua proses (Email & WA) selesai
        await Promise.all([sendEmailPromise, sendWaPromise]);

        // Kirim respon sukses ke Google Sheet
        res.status(200).json({ 
            success: true, 
            message: 'Berhasil! Email & WhatsApp telah dikirim.',
            ticketId: ticketCode
        });

    } catch (error) {
        console.error('❌ TERJADI ERROR:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Route Default untuk Cek Server
app.get('/', (req, res) => {
    res.send('Server Tiket Ramadhan Impact Day 2026 is RUNNING! 🚀');
});

module.exports = app;