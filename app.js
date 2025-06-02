const express = require('express');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());  //Middleware para parsear JSON

//Rotas
app.use('/admin', adminRoutes);  //Rotas de administração (para popular dados)
app.use('/api', apiRoutes);    //Rotas públicas da API

app.get('/', (req, res) => {
    res.send('API de Horários de Ônibus de Saquarema no ar!');
});

//Middleware para tratamento de erros básico
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'Algo deu errado!', details: err.message });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT}`);
});
