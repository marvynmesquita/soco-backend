const express = require('express');
const mongoose = require('mongoose');
const username = 'marvynmesquita';
const password = 'CLFO0XqbihFoaQF6';

const app = express();
app.use(express.json());
const port = 3001;
mongoose.connect(`mongodb+srv://${username}:${password}@cluster0.k9b8wq0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const linhas = mongoose.model('linhas', {
    numero: Number,
    origem: String,
    destino: String,
});

const horarios = mongoose.model('horarios', {
  numero_linha: Number,
  parada_origem: String,
  parada_destino: String,
  horario_partida: String,
  horario_chegada: String,
});

const paradas = mongoose.model('paradas', {
  nome: String,
  localização: String,
});

app.get('/linhas', async (req, res) => {
    const linha = await linhas.find();
    res.send(linha);
});

app.post('/linhas', async (req, res) => {
    req.body.forEach(async(e) => {
        const numero = e.numero;
        const origem = e.origem;
        const destino = e.destino;
        const linha = new linhas({ numero, origem, destino });
        await linha.save();
    });
    res.send('Linha cadastrada com sucesso!');
});

app.get('/horarios', async (req, res) => {
    const horario = await horarios.find();
    res.send(horario);
});

app.get('/horarios/:numero_linha', async (req, res) => {
    const horario = await horarios.find({ numero_linha: req.params.numero_linha });
    res.send(horario);
});

app.post('/horarios', async (req, res) => {
    req.body.forEach(async(e) => {
        const numero_linha = e.numero_linha;
        const parada_origem = e.parada_origem;
        const parada_destino = e.parada_destino;
        const horario_partida = e.horario_partida;
        const horario_chegada = e.horario_chegada;
        const horario = new horarios({ numero_linha, parada_origem, parada_destino, horario_partida, horario_chegada });
        await horario.save();
    });
    res.send('Horário cadastrado com sucesso!');
});

app.get('/paradas', async (req, res) => {
    const parada = await paradas.find();
    res.send(parada);
});

app.post('/paradas', async (req, res) => {
    req.body.forEach(async(e) => {
        const nome = e.nome;
        const localização = e.localização;
        const parada = new paradas({ nome, localização });
        await parada.save();
    });
    res.send('Parada cadastrada com sucesso!');
});

app.get('/', (req, res) => {
  res.send('Conectado a tamoios!');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
})