require('dotenv').config({ path: '../.env' });
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db_config');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3002;

// ================================
// CONFIGURAÇÃO DO MULTER PARA UPLOAD
// ================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'perfil-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Apenas arquivos de imagem são permitidos!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// ================================
// MIDDLEWARES
// ================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos da pasta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '..', 'front')));

// CORS simples
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    console.log(`${req.method} ${req.url} - ${new Date().toLocaleString()}`);
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Rota raiz - servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'front', 'HTML', 'index.html'));
});

// ================================
// MIDDLEWARE DE VERIFICAÇÃO DE ADMIN
// ================================
async function verificarAdmin(req, res, next) {
    try {
        const usuarioId = req.body.usuarioId || req.query.usuarioId || req.headers['x-usuario-id'];
        
        if (!usuarioId) {
            return res.status(401).json({ erro: 'Usuário não autenticado. Forneça usuarioId.' });
        }
        
        const [users] = await db.execute('SELECT tipo FROM usuarios WHERE id = ?', [usuarioId]);
        
        if (users.length === 0 || users[0].tipo !== 'admin') {
            return res.status(403).json({ erro: 'Acesso negado. Apenas administradores podem realizar esta ação.' });
        }
        
        next();
    } catch (error) {
        console.error('Erro ao verificar admin:', error);
        res.status(500).json({ erro: 'Erro interno do servidor' });
    }
}


// CRUD USUÁRIOS


// GET - Listar todos os usuários
app.get('/api/usuarios', async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, nome, email, bio, foto_perfil, tipo, banido, criado_em FROM usuarios ORDER BY criado_em DESC');
        res.json(users);
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST - Login de usuário
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        
        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        // Buscar usuário com senha
        const [users] = await db.execute(
            'SELECT id, nome, email, senha, bio, foto_perfil, tipo, banido, criado_em FROM usuarios WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        const usuario = users[0];

        // Verificar senha (em produção, use bcrypt!)
        if (usuario.senha !== senha) {
            return res.status(401).json({ error: 'Email ou senha incorretos' });
        }

        // Verificar se o usuário está banido
        if (usuario.banido) {
            return res.status(403).json({ error: 'Sua conta foi suspensa. Entre em contato com o suporte.' });
        }

        // Remover senha antes de retornar
        const { senha: _, ...usuarioSemSenha } = usuario;

        res.json({
            success: true,
            usuario: usuarioSemSenha
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET - Buscar usuário por ID
app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [users] = await db.execute(
            `SELECT 
                id, nome, email, bio, foto_perfil, tipo,
                empresa, segmento, cargo, 
                site_empresa, linkedin, 
                criado_em 
            FROM usuarios WHERE id = ?`, 
            [id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST - Criar novo usuário
app.post('/api/usuarios', async (req, res) => {
    try {
        console.log('Recebendo dados para criar usuário:', req.body);
        const { nome, email, senha, bio, foto_perfil, empresa, segmento, cargo } = req.body;
        
        if (!nome || !email || !senha) {
            console.log('Dados obrigatórios faltando');
            return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
        }

        console.log('Verificando se email já existe...');
        // Verificar se email já existe
        const [existing] = await db.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existing.length > 0) {
            console.log('Email já cadastrado:', email);
            return res.status(400).json({ error: 'Email já cadastrado' });
        }

        console.log('Inserindo novo usuário...');
        const [result] = await db.execute(
            'INSERT INTO usuarios (nome, email, senha, bio, foto_perfil, empresa, segmento, cargo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [nome, email, senha, bio || null, foto_perfil || null, empresa || null, segmento || null, cargo || null]
        );

        console.log('Usuário inserido com ID:', result.insertId);
        
        // Buscar o usuário recém-criado
        const [newUser] = await db.execute(
            `SELECT 
                id, nome, email, bio, foto_perfil, tipo,
                empresa, segmento, cargo, 
                site_empresa, linkedin, 
                criado_em 
            FROM usuarios WHERE id = ?`, 
            [result.insertId]
        );
        console.log('Usuário criado:', newUser[0]);
        
        res.status(201).json({ message: 'Usuário criado com sucesso!', usuario: newUser[0] });
    } catch (error) {
        console.error('Erro ao criar usuário:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

// POST - Upload de foto de perfil
app.post('/api/usuarios/:id/foto', upload.single('foto_perfil'), async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
        }
        
        // Verificar se o usuário existe
        const [existing] = await db.execute('SELECT id FROM usuarios WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Construir URL da foto
        const fotoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        // Atualizar o usuário com a nova foto
        await db.execute(
            'UPDATE usuarios SET foto_perfil = ? WHERE id = ?',
            [fotoUrl, id]
        );
        
        // Buscar o usuário atualizado
        const [updatedUser] = await db.execute(
            `SELECT 
                id, nome, email, bio, foto_perfil, 
                empresa, segmento, cargo, 
                site_empresa, linkedin, 
                criado_em 
            FROM usuarios WHERE id = ?`, 
            [id]
        );
        
        res.json({ 
            message: 'Foto de perfil atualizada com sucesso!', 
            usuario: updatedUser[0],
            foto_url: fotoUrl
        });
    } catch (error) {
        console.error('Erro ao fazer upload da foto:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// POST - Upload via base64 (para compatibilidade com o frontend atual)
app.post('/api/usuarios/:id/foto-base64', async (req, res) => {
    try {
        const { id } = req.params;
        const { foto_base64 } = req.body;
        
        if (!foto_base64) {
            return res.status(400).json({ error: 'Dados da imagem não fornecidos' });
        }
        
        // Verificar se o usuário existe
        const [existing] = await db.execute('SELECT id FROM usuarios WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Extrair dados da imagem base64
        const matches = foto_base64.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
        if (!matches) {
            return res.status(400).json({ error: 'Formato de imagem inválido' });
        }
        
        const imageType = matches[1];
        const imageData = matches[2];
        const allowedTypes = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
        
        if (!allowedTypes.includes(imageType.toLowerCase())) {
            return res.status(400).json({ error: 'Tipo de imagem não suportado' });
        }
        
        // Gerar nome único para o arquivo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileName = `perfil-${uniqueSuffix}.${imageType}`;
        const filePath = path.join(__dirname, 'uploads', fileName);
        
        // Salvar a imagem
        fs.writeFileSync(filePath, imageData, 'base64');
        
        // Construir URL da foto
        const fotoUrl = `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
        
        // Atualizar o usuário com a nova foto
        await db.execute(
            'UPDATE usuarios SET foto_perfil = ? WHERE id = ?',
            [fotoUrl, id]
        );
        
        // Buscar o usuário atualizado
        const [updatedUser] = await db.execute('SELECT id, nome, email, bio, foto_perfil, criado_em FROM usuarios WHERE id = ?', [id]);
        
        res.json({ 
            message: 'Foto de perfil atualizada com sucesso!', 
            usuario: updatedUser[0],
            foto_url: fotoUrl
        });
    } catch (error) {
        console.error('Erro ao processar imagem base64:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// PUT - Atualizar usuário
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            nome, 
            email, 
            bio, 
            foto_perfil,
            empresa,
            segmento,
            cargo,
            site_empresa,
            linkedin
        } = req.body;
        
        if (!nome || !email) {
            return res.status(400).json({ error: 'Nome e email são obrigatórios' });
        }
        
        // Verificar se o usuário existe
        const [existing] = await db.execute('SELECT id FROM usuarios WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Verificar se o email já está em uso por outro usuário
        const [emailCheck] = await db.execute('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, id]);
        if (emailCheck.length > 0) {
            return res.status(400).json({ error: 'Email já está em uso por outro usuário' });
        }
        
        // Atualizar o usuário com todos os campos
        await db.execute(
            `UPDATE usuarios SET 
                nome = ?, 
                email = ?, 
                bio = ?, 
                foto_perfil = ?,
                empresa = ?,
                segmento = ?,
                cargo = ?,
                site_empresa = ?,
                linkedin = ?
            WHERE id = ?`,
            [
                nome, 
                email, 
                bio || null, 
                foto_perfil || null,
                empresa || null,
                segmento || null,
                cargo || null,
                site_empresa || null,
                linkedin || null,
                id
            ]
        );
        
        // Buscar o usuário atualizado
        const [updatedUser] = await db.execute(
            `SELECT 
                id, nome, email, bio, foto_perfil, 
                empresa, segmento, cargo, 
                site_empresa, linkedin, 
                criado_em 
            FROM usuarios WHERE id = ?`, 
            [id]
        );
        
        res.json({ 
            message: 'Usuário atualizado com sucesso!', 
            usuario: updatedUser[0] 
        });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// PUT - Alterar tipo de usuário (admin only)
app.put('/api/usuarios/:id/tipo', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo } = req.body;
        
        if (!['admin', 'usuario'].includes(tipo)) {
            return res.status(400).json({ error: 'Tipo inválido. Use "admin" ou "usuario"' });
        }
        
        const [result] = await db.execute(
            'UPDATE usuarios SET tipo = ? WHERE id = ?',
            [tipo, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json({ message: `Usuário alterado para ${tipo} com sucesso!` });
    } catch (error) {
        console.error('Erro ao alterar tipo de usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// PUT - Banir usuário (admin only)
app.put('/api/usuarios/:id/banir', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.execute(
            'UPDATE usuarios SET banido = TRUE WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json({ message: 'Usuário banido com sucesso!' });
    } catch (error) {
        console.error('Erro ao banir usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// PUT - Desbanir usuário (admin only)
app.put('/api/usuarios/:id/desbanir', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.execute(
            'UPDATE usuarios SET banido = FALSE WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json({ message: 'Usuário desbanido com sucesso!' });
    } catch (error) {
        console.error('Erro ao desbanir usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// DELETE - Deletar usuário (admin only)
app.delete('/api/usuarios/:id', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.execute('DELETE FROM usuarios WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json({ message: 'Usuário deletado com sucesso!' });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================
// CRUD POSTAGENS
// ================================

// GET - Listar todas as postagens com contadores
app.get('/api/postagens', async (req, res) => {
    try {
        const [postagens] = await db.execute(`
            SELECT 
                p.*,
                u.nome as usuario_nome,
                u.foto_perfil,
                u.tipo as usuario_tipo,
                (SELECT COUNT(*) FROM curtidas c WHERE c.postagem_id = p.id) as curtidas,
                (SELECT COUNT(*) FROM comentarios cm WHERE cm.postagem_id = p.id) as comentarios
            FROM postagens p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.criado_em DESC
        `);
        res.json(postagens);
    } catch (error) {
        console.error('Erro ao buscar postagens:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/postagens', async (req, res) => {
    try {
        console.log('Recebendo dados para criar postagem:', req.body);
        const { conteudo, usuario_id, categoria = 'Geral', tags = '' } = req.body;
        
        if (!conteudo || !usuario_id) {
            console.log('Dados obrigatórios faltando');
            return res.status(400).json({ error: 'Conteúdo e usuário são obrigatórios' });
        }
        
        console.log('Tentando inserir postagem...');
        
        const [result] = await db.execute(
            'INSERT INTO postagens (conteudo, usuario_id, categoria, tags) VALUES (?, ?, ?, ?)', 
            [conteudo, usuario_id, categoria, tags]
        );
        
        console.log('Postagem inserida com ID:', result.insertId);
        
        const [newPost] = await db.execute(`
            SELECT p.*, u.nome as autor_nome, u.foto_perfil as autor_foto, u.tipo as usuario_tipo
            FROM postagens p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [result.insertId]);
        
        console.log('Postagem criada:', newPost[0]);
        res.status(201).json({ message: 'Postagem criada com sucesso!', postagem: newPost[0] });
        
    } catch (error) {
        console.error('❌ Erro geral ao criar postagem:', error.message);
        console.error('📋 Stack trace:', error.stack);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

// PUT - Atualizar postagem
app.put('/api/postagens/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { conteudo, usuarioId } = req.body;
        
        if (!conteudo) {
            return res.status(400).json({ error: 'Conteúdo é obrigatório' });
        }
        
        if (!usuarioId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        
        // Verificar se a postagem existe e pertence ao usuário
        const [postagens] = await db.execute('SELECT usuario_id FROM postagens WHERE id = ?', [id]);
        
        if (postagens.length === 0) {
            return res.status(404).json({ error: 'Postagem não encontrada' });
        }
        
        // Verificar se é o dono da postagem
        if (postagens[0].usuario_id !== parseInt(usuarioId)) {
            return res.status(403).json({ error: 'Você não tem permissão para editar esta postagem' });
        }

        const [result] = await db.execute('UPDATE postagens SET conteudo = ? WHERE id = ?', [conteudo, id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Postagem não encontrada' });
        }

        res.json({ message: 'Postagem atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar postagem:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// DELETE - Deletar postagem (apenas admin ou dono da postagem)
app.delete('/api/postagens/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const usuarioId = req.body.usuarioId || req.query.usuarioId;
        
        if (!usuarioId) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }
        
        // Buscar informações da postagem e do usuário
        const [postagens] = await db.execute('SELECT usuario_id FROM postagens WHERE id = ?', [id]);
        
        if (postagens.length === 0) {
            return res.status(404).json({ error: 'Postagem não encontrada' });
        }
        
        const [users] = await db.execute('SELECT tipo FROM usuarios WHERE id = ?', [usuarioId]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        // Verificar se é admin ou dono da postagem
        const ehAdmin = users[0].tipo === 'admin';
        const ehDono = postagens[0].usuario_id === parseInt(usuarioId);
        
        if (!ehAdmin && !ehDono) {
            return res.status(403).json({ error: 'Você não tem permissão para deletar esta postagem' });
        }
        
        const [result] = await db.execute('DELETE FROM postagens WHERE id = ?', [id]);

        res.json({ message: 'Postagem deletada com sucesso!' });
    } catch (error) {
        console.error('Erro ao deletar postagem:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET - Buscar postagem por ID
app.get('/api/postagens/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [postagens] = await db.execute(`
            SELECT 
                p.*,
                u.nome as usuario_nome,
                u.foto_perfil,
                (SELECT COUNT(*) FROM curtidas c WHERE c.postagem_id = p.id) as curtidas,
                (SELECT COUNT(*) FROM comentarios cm WHERE cm.postagem_id = p.id) as comentarios
            FROM postagens p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = ?
        `, [id]);
        
        if (postagens.length === 0) {
            return res.status(404).json({ error: 'Postagem não encontrada' });
        }
        
        res.json(postagens[0]);
    } catch (error) {
        console.error('Erro ao buscar postagem:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});


// COMENTÁRIOS

// ================================
// ROTAS PARA ESTATÍSTICAS (ADMIN)
// ================================

// GET - Listar TODOS os comentários (para estatísticas)
app.get('/api/comentarios', async (req, res) => {
    try {
        const [comments] = await db.execute('SELECT * FROM comentarios');
        res.json(comments);
    } catch (error) {
        console.error('Erro ao buscar todos os comentários:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET - Listar TODAS as curtidas (para estatísticas)
app.get('/api/curtidas', async (req, res) => {
    try {
        const [likes] = await db.execute('SELECT * FROM curtidas');
        res.json(likes);
    } catch (error) {
        console.error('Erro ao buscar todas as curtidas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// GET - Listar TODAS as conversas (para estatísticas)
app.get('/api/conversas', async (req, res) => {
    try {
        const [conversas] = await db.execute('SELECT * FROM conversas');
        res.json(conversas);
    } catch (error) {
        console.error('Erro ao buscar todas as conversas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================
// ROTAS DE COMENTÁRIOS
// ================================

// GET - Buscar comentários de uma postagem específica
app.get('/api/comentarios/:postagem_id', async (req, res) => {
    try {
        const [comments] = await db.execute(`
            SELECT c.*, u.nome as autor_nome, u.foto_perfil as autor_foto
            FROM comentarios c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.postagem_id = ?
            ORDER BY c.criado_em ASC
        `, [req.params.postagem_id]);
        res.json(comments);
    } catch (error) {
        console.error('Erro ao buscar comentários:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/comentarios', async (req, res) => {
    try {
        const { usuario_id, postagem_id, texto } = req.body;
        const missing = [];
        if (!usuario_id) missing.push('usuario_id');
        if (!postagem_id) missing.push('postagem_id');
        if (!texto) missing.push('texto');
        if (missing.length) return res.status(400).json({ error: 'Campos obrigatórios ausentes', campos: missing });
        const [result] = await db.execute('INSERT INTO comentarios (usuario_id, postagem_id, texto) VALUES (?, ?, ?)', [usuario_id, postagem_id, texto]);
        res.status(201).json({ success: true, message: 'Comentário criado', id: result.insertId });
    } catch (error) {
        console.error('Erro ao criar comentário:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Compatibilidade de comentários
app.get('/api/comments/post/:postId', async (req, res) => {
    try {
        const [comments] = await db.execute(`
            SELECT c.id, c.texto, c.criado_em, u.nome as autor_nome
            FROM comentarios c
            JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.postagem_id = ?
            ORDER BY c.criado_em ASC
        `, [req.params.postId]);
        res.json(comments);
    } catch (error) {
        console.error('Erro ao listar comentários (compat):', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/comments', async (req, res) => {
    try {
        const { usuario_id, postagem_id, texto } = req.body;
        const missing = [];
        if (!usuario_id) missing.push('usuario_id');
        if (!postagem_id) missing.push('postagem_id');
        if (!texto) missing.push('texto');
        if (missing.length) return res.status(400).json({ error: 'Campos obrigatórios auscentes', campos: missing });
        const [result] = await db.execute('INSERT INTO comentarios (usuario_id, postagem_id, texto) VALUES (?, ?, ?)', [usuario_id, postagem_id, texto]);
        res.status(201).json({ success: true, message: 'Comentário criado', id: result.insertId });
    } catch (error) {
        console.error('Erro ao criar comentário (compat):', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// CURTIDAS

app.post('/api/curtidas', async (req, res) => {
    try {
        const { postagem_id, usuario_id } = req.body;
        if (!postagem_id || !usuario_id) return res.status(400).json({ error: 'ID da postagem e usuário são obrigatórios' });
        const [existing] = await db.execute('SELECT id FROM curtidas WHERE postagem_id = ? AND usuario_id = ?', [postagem_id, usuario_id]);
        if (existing.length > 0) {
            await db.execute('DELETE FROM curtidas WHERE postagem_id = ? AND usuario_id = ?', [postagem_id, usuario_id]);
            return res.json({ message: 'Curtida removida', curtiu: false });
        }
        await db.execute('INSERT INTO curtidas (postagem_id, usuario_id) VALUES (?, ?)', [postagem_id, usuario_id]);
        res.json({ message: 'Postagem curtida', curtiu: true });
    } catch (error) {
        console.error('Erro ao curtir:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Compatibilidade de curtidas
app.get('/api/likes/check/:postId', async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.query.userId || req.headers['user-id'];
        if (!userId) return res.json({ curtiu: false });
        const [result] = await db.execute('SELECT id FROM curtidas WHERE postagem_id = ? AND usuario_id = ?', [postId, userId]);
        res.json({ curtiu: result.length > 0 });
    } catch (error) {
        console.error('Erro ao verificar curtida:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/likes/toggle', async (req, res) => {
    try {
        const { postId, userId } = req.body;
        if (!postId || !userId) return res.status(400).json({ error: 'ID da postagem e usuário são obrigatórios' });
        const [existing] = await db.execute('SELECT id FROM curtidas WHERE postagem_id = ? AND usuario_id = ?', [postId, userId]);
        if (existing.length > 0) {
            await db.execute('DELETE FROM curtidas WHERE postagem_id = ? AND usuario_id = ?', [postId, userId]);
            return res.json({ message: 'Curtida removida', curtiu: false });
        }
        await db.execute('INSERT INTO curtidas (postagem_id, usuario_id) VALUES (?, ?)', [postId, userId]);
        res.json({ message: 'Postagem curtida', curtiu: true });
    } catch (error) {
        console.error('Erro ao curtir (compat):', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/likes/count/:postId', async (req, res) => {
    try {
        const [result] = await db.execute('SELECT COUNT(*) as total FROM curtidas WHERE postagem_id = ?', [req.params.postId]);
        res.json({ total: result[0].total });
    } catch (error) {
        console.error('Erro ao contar curtidas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================
// ENDPOINT DE DIAGNÓSTICO COM IA
// ================================

app.post('/api/diagnostico', async (req, res) => {
    try {
        const { empresa, segmento, publico, presenca, objetivo } = req.body;
        
        console.log('📊 Gerando diagnóstico para:', empresa);
        
        // Criar o prompt para a IA
        const prompt = `Você é um consultor especializado em marketing digital para microempreendedores.

Gere um diagnóstico de marketing digital DETALHADO e PERSONALIZADO para a seguinte empresa:

**Empresa:** ${empresa}
**Segmento:** ${segmento}
**Público-alvo:** ${publico}
**Presença digital atual:** ${presenca}
**Objetivo principal:** ${objetivo}

Por favor, forneça:

## 1. Análise da Situação Atual
Avalie a situação atual da empresa com base nas informações fornecidas.

## 2. Pontos Fortes e Oportunidades
Identifique pontos positivos e oportunidades de crescimento.

## 3. Desafios e Pontos de Atenção
Liste os principais desafios que a empresa pode enfrentar.

## 4. Recomendações Estratégicas
Forneça 5-7 recomendações práticas e acionáveis, específicas para este negócio.

## 5. Próximos Passos
Sugira um plano de ação com 3-5 passos prioritários para começar.

Seja específico, prático e motivador. Use uma linguagem acessível para microempreendedores.`;

        // Por enquanto, vamos gerar um diagnóstico simulado
        // Você pode substituir isso por uma chamada real à API da OpenAI, Gemini, etc.
        const diagnosticoSimulado = gerarDiagnosticoSimulado(empresa, segmento, publico, presenca, objetivo);
        
        // Se você quiser usar a API real do OpenAI, descomente o código abaixo:
        /*
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Você é um consultor de marketing digital especializado em microempreendedores.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });
        
        const openaiData = await openaiResponse.json();
        const diagnostico = openaiData.choices[0].message.content;
        */
        
        res.json({ 
            success: true,
            diagnostico: diagnosticoSimulado
        });
        
    } catch (error) {
        console.error('❌ Erro ao gerar diagnóstico:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao gerar diagnóstico',
            message: error.message 
        });
    }
});

// Função para gerar diagnóstico simulado
function gerarDiagnosticoSimulado(empresa, segmento, publico, presenca, objetivo) {
    const nivelPresenca = {
        'inexistente': 'Sua empresa ainda não tem presença online estabelecida',
        'basica': 'Você já deu os primeiros passos no digital, mas há muito espaço para crescer',
        'media': 'Sua presença digital está em desenvolvimento, com boas bases estabelecidas',
        'avancada': 'Você já tem uma estratégia digital consolidada e pode otimizar ainda mais'
    };
    
    const objetivos = {
        'aumentar_vendas': 'aumentar as vendas através do marketing digital',
        'mais_visibilidade': 'ganhar mais visibilidade e alcançar novos clientes',
        'fidelizar_clientes': 'fidelizar clientes e criar relacionamentos duradouros',
        'expandir_negocio': 'expandir o negócio e alcançar novos mercados'
    };
    
    return `# Diagnóstico de Marketing Digital - ${empresa}

## 1. Análise da Situação Atual

${nivelPresenca[presenca] || 'Seu negócio tem potencial para crescer no ambiente digital'}. Como empresa do segmento de **${segmento}**, você atende um público específico: **${publico}**.

Seu principal objetivo é **${objetivos[objetivo] || objetivo}**, o que demonstra clareza sobre onde você quer chegar.

## 2. Pontos Fortes e Oportunidades

✅ **Segmento definido:** Atuar em ${segmento} permite criar estratégias focadas e relevantes.

✅ **Público identificado:** Conhecer seu público (${publico}) é o primeiro passo para comunicação eficaz.

✅ **Objetivo claro:** Ter ${objetivo.replace('_', ' ')} como meta facilita o planejamento estratégico.

🌟 **Oportunidade:** O marketing digital democratizou o acesso a ferramentas poderosas - pequenas empresas podem competir com grandes marcas usando estratégias inteligentes.

## 3. Desafios e Pontos de Atenção

⚠️ **Consistência:** Manter presença regular nas redes sociais é essencial para construir audiência.

⚠️ **Conteúdo de valor:** Seu público precisa ver valor no que você compartilha, não apenas propaganda.

⚠️ **Análise de resultados:** É importante medir o que funciona e ajustar estratégias constantemente.

⚠️ **Diferenciação:** Em um mercado competitivo, destacar o que torna ${empresa} única é fundamental.

## 4. Recomendações Estratégicas

**1. Fortaleça sua presença nas redes sociais**
- Escolha 2-3 plataformas onde seu público está (Instagram, Facebook, LinkedIn)
- Poste 3-5 vezes por semana com conteúdo de valor
- Use Stories para humanizar sua marca e criar proximidade

**2. Crie conteúdo educativo**
- Compartilhe dicas relacionadas ao ${segmento}
- Mostre bastidores do seu negócio
- Responda dúvidas comuns do seu público

**3. Invista em relacionamento**
- Responda TODOS os comentários e mensagens
- Crie enquetes e perguntas para engajar
- Agradeça e reconheça clientes fiéis publicamente

**4. Use prova social**
- Compartilhe depoimentos de clientes satisfeitos
- Mostre casos de sucesso e resultados
- Peça avaliações e feedback constantemente

**5. Otimize para busca local**
- Cadastre-se no Google Meu Negócio
- Inclua seu endereço e horários atualizados
- Incentive avaliações no Google

**6. Experimente anúncios pagos (com orçamento baixo)**
- Comece com R$ 5-10 por dia no Facebook/Instagram Ads
- Teste diferentes públicos e mensagens
- Acompanhe métricas: alcance, cliques, conversões

**7. Networking digital**
- Participe de grupos relacionados ao ${segmento}
- Colabore com outros microempreendedores
- Use a MicroMídia para trocar experiências!

## 5. Próximos Passos (Comece HOJE!)

**Semana 1-2: Fundação**
1. Atualize perfis em todas as redes sociais (bio, foto, links)
2. Crie um calendário de conteúdo para o próximo mês
3. Cadastre-se no Google Meu Negócio

**Semana 3-4: Engajamento**
4. Publique pelo menos 3x por semana
5. Responda 100% dos comentários e mensagens
6. Peça feedback de 5 clientes e compartilhe (com permissão)

**Mês 2 em diante: Crescimento**
7. Analise métricas semanalmente (alcance, engajamento, conversões)
8. Ajuste estratégia com base nos resultados
9. Teste um pequeno investimento em anúncios (R$ 50-100/mês)
10. Continue aprendendo: cursos gratuitos, comunidades, networking

---

💡 **Lembre-se:** Marketing digital é uma maratona, não uma corrida de 100 metros. Consistência e autenticidade são mais importantes que perfeição. Comece pequeno, aprenda com os resultados e vá crescendo gradualmente.

🚀 **Você está no caminho certo!** A ${empresa} tem potencial para se destacar no ${segmento}. Continue investindo no seu crescimento digital!

---

📱 **Dica extra:** Use a MicroMídia para compartilhar sua jornada, fazer perguntas e aprender com outros empreendedores que estão no mesmo caminho que você!`;
}

// ================================
// API DE CHAT - CONVERSAS E MENSAGENS
// ================================

// GET - Listar conversas do usuário logado
app.get('/api/conversas/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;
        
        const [conversas] = await db.execute(`
            SELECT DISTINCT
                c.id,
                c.tipo,
                c.nome,
                c.criado_em,
                c.atualizado_em,
                (SELECT u2.id 
                 FROM participantes_conversa pc2 
                 JOIN usuarios u2 ON pc2.usuario_id = u2.id 
                 WHERE pc2.conversa_id = c.id 
                 AND pc2.usuario_id != ? 
                 LIMIT 1) as outro_usuario_id,
                (SELECT u2.nome 
                 FROM participantes_conversa pc2 
                 JOIN usuarios u2 ON pc2.usuario_id = u2.id 
                 WHERE pc2.conversa_id = c.id 
                 AND pc2.usuario_id != ? 
                 LIMIT 1) as outro_usuario_nome,
                (SELECT u2.foto_perfil 
                 FROM participantes_conversa pc2 
                 JOIN usuarios u2 ON pc2.usuario_id = u2.id 
                 WHERE pc2.conversa_id = c.id 
                 AND pc2.usuario_id != ? 
                 LIMIT 1) as outro_usuario_foto,
                (SELECT m.conteudo 
                 FROM mensagens m 
                 WHERE m.conversa_id = c.id 
                 ORDER BY m.criado_em DESC 
                 LIMIT 1) as ultima_mensagem,
                (SELECT m.criado_em 
                 FROM mensagens m 
                 WHERE m.conversa_id = c.id 
                 ORDER BY m.criado_em DESC 
                 LIMIT 1) as ultima_mensagem_hora,
                (SELECT COUNT(*) 
                 FROM mensagens m 
                 WHERE m.conversa_id = c.id 
                 AND m.remetente_id != ? 
                 AND m.lida = FALSE) as nao_lidas
            FROM conversas c
            INNER JOIN participantes_conversa pc ON c.id = pc.conversa_id
            WHERE pc.usuario_id = ?
            ORDER BY c.atualizado_em DESC
        `, [usuarioId, usuarioId, usuarioId, usuarioId, usuarioId]);
        
        res.json(conversas);
    } catch (error) {
        console.error('Erro ao buscar conversas:', error);
        res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
});

// POST - Criar nova conversa
app.post('/api/conversas', async (req, res) => {
    try {
        const { usuario1_id, usuario2_id, tipo = 'privada' } = req.body;
        
        // Verificar se já existe conversa entre esses usuários
        const [conversaExistente] = await db.execute(`
            SELECT c.id 
            FROM conversas c
            INNER JOIN participantes_conversa pc1 ON c.id = pc1.conversa_id
            INNER JOIN participantes_conversa pc2 ON c.id = pc2.conversa_id
            WHERE pc1.usuario_id = ? 
            AND pc2.usuario_id = ?
            AND c.tipo = 'privada'
            LIMIT 1
        `, [usuario1_id, usuario2_id]);
        
        if (conversaExistente.length > 0) {
            return res.json({ id: conversaExistente[0].id, mensagem: 'Conversa já existe' });
        }
        
        // Criar nova conversa
        const [result] = await db.execute(
            'INSERT INTO conversas (tipo, criado_em, atualizado_em) VALUES (?, NOW(), NOW())',
            [tipo]
        );
        
        const conversaId = result.insertId;
        
        // Adicionar participantes
        await db.execute(
            'INSERT INTO participantes_conversa (conversa_id, usuario_id) VALUES (?, ?), (?, ?)',
            [conversaId, usuario1_id, conversaId, usuario2_id]
        );
        
        res.status(201).json({ id: conversaId, mensagem: 'Conversa criada com sucesso' });
    } catch (error) {
        console.error('Erro ao criar conversa:', error);
        res.status(500).json({ error: 'Erro ao criar conversa' });
    }
});

// GET - Buscar mensagens de uma conversa
app.get('/api/mensagens/:conversaId', async (req, res) => {
    try {
        const { conversaId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const [mensagens] = await db.execute(`
            SELECT 
                m.id,
                m.conversa_id,
                m.remetente_id,
                u.nome as remetente_nome,
                u.foto_perfil as remetente_foto,
                m.conteudo,
                m.lida,
                m.criado_em
            FROM mensagens m
            INNER JOIN usuarios u ON m.remetente_id = u.id
            WHERE m.conversa_id = ?
            ORDER BY m.criado_em ASC
            LIMIT ${limit} OFFSET ${offset}
        `, [conversaId]);
        
        res.json(mensagens);
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
});

// POST - Enviar mensagem
app.post('/api/mensagens', async (req, res) => {
    try {
        const { conversa_id, remetente_id, conteudo } = req.body;
        
        if (!conversa_id || !remetente_id || !conteudo) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }
        
        // Inserir mensagem
        const [result] = await db.execute(
            'INSERT INTO mensagens (conversa_id, remetente_id, conteudo, lida, criado_em) VALUES (?, ?, ?, FALSE, NOW())',
            [conversa_id, remetente_id, conteudo]
        );
        
        // Atualizar timestamp da conversa
        await db.execute(
            'UPDATE conversas SET atualizado_em = NOW() WHERE id = ?',
            [conversa_id]
        );
        
        // Buscar dados completos da mensagem
        const [mensagem] = await db.execute(`
            SELECT 
                m.id,
                m.conversa_id,
                m.remetente_id,
                u.nome as remetente_nome,
                u.foto_perfil as remetente_foto,
                m.conteudo,
                m.lida,
                m.criado_em
            FROM mensagens m
            INNER JOIN usuarios u ON m.remetente_id = u.id
            WHERE m.id = ?
        `, [result.insertId]);
        
        res.status(201).json(mensagem[0]);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

// PUT - Marcar mensagens como lidas
app.put('/api/mensagens/marcar-lidas/:conversaId/:usuarioId', async (req, res) => {
    try {
        const { conversaId, usuarioId } = req.params;
        
        await db.execute(
            'UPDATE mensagens SET lida = TRUE WHERE conversa_id = ? AND remetente_id != ?',
            [conversaId, usuarioId]
        );
        
        res.json({ mensagem: 'Mensagens marcadas como lidas' });
    } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
        res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
    }
});

// ================================
// SOCKET.IO PARA CHAT EM TEMPO REAL
// ================================

io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

    // Entrar em uma sala (conversa)
    socket.on('join-room', (conversaId) => {
        socket.join(`conversa-${conversaId}`);
        console.log(`Socket ${socket.id} entrou na conversa ${conversaId}`);
    });

    // Enviar mensagem
    socket.on('send-message', (data) => {
        io.to(`conversa-${data.conversaId}`).emit('new-message', data);
    });

    // Usuário está digitando
    socket.on('typing', (data) => {
        socket.to(`conversa-${data.conversaId}`).emit('user-typing', data);
    });

    // Desconexão
    socket.on('disconnect', () => {
        console.log(`Socket desconectado: ${socket.id}`);
    });

    
});

// ================================
// ROTA ESPECIAL: CRIAR ADMIN (APENAS DESENVOLVIMENTO)
// ================================
app.post('/api/criar-admin-inicial', async (req, res) => {
    try {
        // Verificar se já existe
        const [usuarios] = await db.query(
            'SELECT * FROM usuarios WHERE email = ?',
            ['annaluizapm2007@gmail.com']
        );

        if (usuarios.length > 0) {
            // Atualizar para admin
            await db.query(
                'UPDATE usuarios SET tipo = ?, senha = ? WHERE email = ?',
                ['admin', '123', 'annaluizapm2007@gmail.com']
            );
            res.json({ 
                success: true, 
                message: 'Usuário promovido a admin com sucesso!',
                usuario: usuarios[0]
            });
        } else {
            // Criar novo admin
            const [result] = await db.query(
                'INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, ?)',
                ['Anna Luiza', 'annaluizapm2007@gmail.com', '123', 'admin']
            );
            res.json({ 
                success: true, 
                message: 'Usuário admin criado com sucesso!',
                id: result.insertId
            });
        }
    } catch (error) {
        console.error('Erro ao criar admin:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ================================
// INICIAR SERVIDOR
// ================================

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Acesse: http://127.0.0.1:${PORT}`);
    console.log(`Teste: http://127.0.0.1:${PORT}/api/test`);
    console.log(`Socket.IO ativo para chat em tempo real`);
});
