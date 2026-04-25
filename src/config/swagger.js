import swaggerJsdoc from 'swagger-jsdoc'

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API LBCC',
            version: '1.0.0',
            description: 'Documentação da API do sistema LBCC'
        },
        servers: [
            {
                url: 'http://localhost:3000'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },

    apis: ['./src/modules/**/*.js'] // 🔥 lê suas rotas automaticamente
}

const swaggerSpec = swaggerJsdoc(options)

export default swaggerSpec