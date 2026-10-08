# Altrum Backend

API backend do Altrum, uma plataforma de doações e moedas. O projeto fornece autenticação de usuários, gerenciamento de compras e doações, armazenamento de arquivos e comunicação em tempo real.

## Tecnologias

- Node.js e Express
- MongoDB com Mongoose
- JWT e bcrypt para autenticação
- Socket.IO e WebSocket
- Google Cloud Storage
- SendGrid e Nodemailer
- Jest e Supertest

## Instalação

```bash
git clone https://github.com/leninfontella/api-backend-coins.git
cd api-backend-coins
npm install
```

Crie um arquivo `.env` na raiz e configure as credenciais e variáveis necessárias para o ambiente. O arquivo `.env` não deve ser enviado ao Git.

## Execução

```bash
# Desenvolvimento
npm run dev

# Produção
npm start

# Testes
npm test
```

O ponto de entrada da aplicação é `src/server.js`.

## Licença

Distribuído sob a licença ISC.
