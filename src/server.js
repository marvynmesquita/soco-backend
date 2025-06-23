// src/server.js
const express = require('express');
const dotenv = require('dotenv');
const busRoutes = require('./routes/busRoutes');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Backend tamoios está no ar!');
});

app.use('/api', busRoutes);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});