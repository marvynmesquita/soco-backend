// src/server.js
const express = require('express');
const dotenv = require('dotenv');
const busRoutes = require('./routes/busRoutes');
const cors = require('cors');

dotenv.config();

const app = express();

// No Heroku/Render, devemos usar a variável process.env.PORT.
// Se ela não existir (ambiente local), usamos a 3001 como padrão.
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('API do Clone do Moovit está no ar!');
});

app.use('/api', busRoutes);

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});