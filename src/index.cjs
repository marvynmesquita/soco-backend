//tentar: https://medium.com/neo4j/using-neogma-to-build-a-type-safe-node-js-app-with-a-neo4j-graph-database-f289d79dbc52

require('dotenv').config();
const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;

const { Neogma } = require('neogma');

const neogma = new Neogma({
        url: NEO4J_URI,
        username: NEO4J_USERNAME,
        password: NEO4J_PASSWORD
    }, {
        logger: console.log,
        encrypted: false
    },
);

const { ModelFactory, NeogmaInstance } = require('neogma');

const Linha = ModelFactory(neogma).define('Linha', {
    schema: {
        name: {
            type: 'string',
            required: true
        },
        horarios: {
            type: 'Array',
            required: true
        },
        id: {
            type: 'string',
            required: true
        },
    }
});