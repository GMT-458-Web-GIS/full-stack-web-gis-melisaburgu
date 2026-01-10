const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// JSON verileri okuyabilmesi için
app.use(express.json());

// Test rotası (Tarayıcıdan girince bunu göreceğiz)
app.get('/', (req, res) => {
  res.send('Web GIS Projesi - Commit 1: Sistem Ayakta!');
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});