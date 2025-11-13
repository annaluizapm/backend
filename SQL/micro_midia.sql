-- ================================================
-- BANCO DE DADOS COMPLETO - MicroMídia
-- Rede Social para Microempreendedores
-- ================================================

CREATE DATABASE IF NOT EXISTS micro_midia;
USE micro_midia;

-- Remover banco existente se necessário (CUIDADO: apaga todos os dados!)
-- DROP DATABASE IF EXISTS micro_midia;
-- CREATE DATABASE micro_midia;
-- USE micro_midia;

-- ================================================
-- TABELA: USUÁRIOS
-- ================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    tipo ENUM('admin', 'usuario') DEFAULT 'usuario',
    bio TEXT,
    foto_perfil VARCHAR(500),
    empresa VARCHAR(100),
    segmento VARCHAR(50),
    cargo VARCHAR(100),
    site_empresa VARCHAR(255),
    linkedin VARCHAR(255),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
);

-- ================================================
-- TABELA: NEGÓCIOS
-- ================================================

CREATE TABLE IF NOT EXISTS negocios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    categoria VARCHAR(50),
    site VARCHAR(255),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (usuario_id)
);

-- ================================================
-- TABELA: POSTAGENS
-- ================================================

CREATE TABLE IF NOT EXISTS postagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    conteudo TEXT NOT NULL,
    categoria VARCHAR(50) DEFAULT 'Geral',
    tags TEXT,
    imagem VARCHAR(255),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (usuario_id),
    INDEX idx_criado (criado_em)
);

-- ================================================
-- TABELA: CURTIDAS (Compatibilidade com sistema antigo)
-- ================================================

CREATE TABLE IF NOT EXISTS curtidas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    postagem_id INT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (postagem_id) REFERENCES postagens(id) ON DELETE CASCADE,
    UNIQUE KEY unique_like (usuario_id, postagem_id),
    INDEX idx_postagem (postagem_id)
);

-- ================================================
-- TABELA: COMENTÁRIOS
-- ================================================

CREATE TABLE IF NOT EXISTS comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    postagem_id INT NOT NULL,
    texto TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (postagem_id) REFERENCES postagens(id) ON DELETE CASCADE,
    INDEX idx_postagem (postagem_id),
    INDEX idx_criado (criado_em)
);

-- ================================================
-- RF2: SISTEMA DE CHAT/MENSAGENS
-- ================================================

CREATE TABLE IF NOT EXISTS conversas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('privada', 'grupo') DEFAULT 'privada',
    nome VARCHAR(100),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tipo (tipo)
);


CREATE TABLE IF NOT EXISTS mensagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversa_id INT NOT NULL,
    remetente_id INT NOT NULL,
    conteudo TEXT NOT NULL,
    lida BOOLEAN DEFAULT FALSE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE,
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_conversa (conversa_id),
    INDEX idx_criado (criado_em)
);

-- ================================================
-- RF5: SISTEMA DE DIAGNÓSTICO COM IA
-- ================================================

CREATE TABLE IF NOT EXISTS diagnosticos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    empresa VARCHAR(100),
    segmento VARCHAR(50),
    publico_alvo TEXT,
    presenca_digital VARCHAR(50),
    objetivo VARCHAR(50),
    respostas JSON,
    relatorio_ia TEXT,
    score INT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (usuario_id),
    INDEX idx_criado (criado_em)
);


SELECT 
    (SELECT COUNT(*) FROM usuarios) as 'Total de Usuários',
    (SELECT COUNT(*) FROM postagens) as 'Total de Postagens',
    (SELECT COUNT(*) FROM comentarios) as 'Total de Comentários',
    (SELECT COUNT(*) FROM curtidas) as 'Total de Curtidas',
    (SELECT COUNT(*) FROM conversas) as 'Total de Conversas',
    (SELECT COUNT(*) FROM mensagens) as 'Total de Mensagens',
    (SELECT COUNT(*) FROM diagnosticos) as 'Total de diagnosticos';

-- ================================================
-- ADICIONAR COLUNA TIPO (SE NÃO EXISTIR)
-- ================================================
-- Verificar se a coluna já existe antes de adicionar
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'micro_midia' 
AND TABLE_NAME = 'usuarios' 
AND COLUMN_NAME = 'tipo';

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE usuarios ADD COLUMN tipo ENUM(''admin'', ''usuario'') DEFAULT ''usuario'' AFTER senha;',
    'SELECT ''Coluna tipo já existe'' as mensagem;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ================================================
-- ADICIONAR COLUNA BANIDO (SE NÃO EXISTIR)
-- ================================================
-- Verificar se a coluna já existe antes de adicionar
SET @col_banido = 0;
SELECT COUNT(*) INTO @col_banido 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'micro_midia' 
AND TABLE_NAME = 'usuarios' 
AND COLUMN_NAME = 'banido';

SET @sql_banido = IF(@col_banido = 0, 
    'ALTER TABLE usuarios ADD COLUMN banido BOOLEAN DEFAULT FALSE AFTER tipo;',
    'SELECT ''Coluna banido já existe'' as mensagem;'
);

PREPARE stmt2 FROM @sql_banido;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ================================================
-- PROMOVER USUÁRIO A ADMINISTRADOR
-- ================================================
-- Criar usuário admin se não existir:
INSERT INTO usuarios (nome, email, senha, tipo) 
SELECT 'Anna Luiza', 'annaluizapm2007@gmail.com', '123', 'admin'
WHERE NOT EXISTS (
    SELECT 1 FROM usuarios WHERE email = 'annaluizapm2007@gmail.com'
);

-- Atualizar para admin se já existir:
UPDATE usuarios SET tipo = 'admin' WHERE email = 'annaluizapm2007@gmail.com';

-- Verificar se funcionou:
SELECT id, nome, email, tipo FROM usuarios WHERE email = 'annaluizapm2007@gmail.com';

-- ================================================
-- FIM DO SCRIPT
-- ================================================