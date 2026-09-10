from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Numeric, ForeignKey, DateTime, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from typing import List, Optional
from datetime import datetime

# URL do banco de dados (ajuste se necessário para sua conexão Neon/PostgreSQL ou MySQL)
DATABASE_URL = "sqlite:///./congelados.db" # Exemplo local ou substitua pela sua string do banco

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS DO BANCO DE DADOS (SQLALCHEMY) ---
class Produto(Base):
    __tablename__ = "produtos"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    preco = Column(Numeric(10, 2), nullable=False)
    estoque = Column(Integer, nullable=False, default=0)
    foto = Column(String, nullable=True) # Suporta a string Base64 da imagem

class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    telefone = Column(String(20), nullable=True)

class Pedido(Base):
    __tablename__ = "pedidos"
    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    data_criacao = Column(DateTime, default=datetime.utcnow)
    status = Column(String(45), default="Concluído")

    cliente = relationship("Cliente")
    itens = relationship("ItemPedido", cascade="all, delete-orphan")

class ItemPedido(Base):
    __tablename__ = "itens_pedido"
    id = Column(Integer, primary_key=True, index=True)
    pedido_id = Column(Integer, ForeignKey("pedidos.id"), nullable=False)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=False)
    quantidade = Column(Integer, nullable=False)
    preco_venda = Column(Numeric(10, 2), nullable=False)

    produto = relationship("Produto")

Base.metadata.create_all(bind=engine)

# --- SCHEMAS PYDANTIC ---
class ProdutoCreate(BaseModel):
    nome: str
    preco: float
    estoque: int
    foto: Optional[str] = None

class ProdutoResponse(ProdutoCreate):
    id: int
    class Config:
        orm_mode = True

class ClienteCreate(BaseModel):
    nome: str
    telefone: Optional[str] = None

class ClienteResponse(ClienteCreate):
    id: int
    class Config:
        orm_mode = True

class ItemPedidoCreate(BaseModel):
    produto_id: int
    quantidade: int

class PedidoCreate(BaseModel):
    cliente_id: int
    itens: List[ItemPedidoCreate]

# --- DEPENDÊNCIA DE SESSÃO ---
app = FastAPI(title="Congelados e Cia API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- ROTAS DE PRODUTOS ---
@app.get("/produtos/", response_model=List[ProdutoResponse])
def listar_produtos(db: Session = Depends(get_db)):
    return db.query(Produto).all()

@app.post("/produtos/", status_code=status.HTTP_201_CREATED)
def criar_produto(produto: ProdutoCreate, db: Session = Depends(get_db)):
    novo_produto = Produto(
        nome=produto.nome,
        preco=produto.preco,
        estoque=produto.estoque,
        foto=produto.foto
    )
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    return {"mensagem": "Produto cadastrado com sucesso!", "produto": novo_produto}

@app.put("/produtos/{produto_id}")
def atualizar_produto(produto_id: int, produto: ProdutoCreate, db: Session = Depends(get_db)):
    prod_db = db.query(Produto).filter(Produto.id == produto_id).first()
    if not prod_db:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    prod_db.nome = produto.nome
    prod_db.preco = produto.preco
    prod_db.estoque = produto.estoque
    if produto.foto:
        prod_db.foto = produto.foto
        
    db.commit()
    db.refresh(prod_db)
    return {"mensagem": "Produto atualizado com sucesso!", "produto": prod_db}

@app.delete("/produtos/{produto_id}")
def excluir_produto(produto_id: int, db: Session = Depends(get_db)):
    prod = db.query(Produto).filter(Produto.id == produto_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    db.delete(prod)
    db.commit()
    return {"mensagem": "Produto excluído com sucesso"}

# --- ROTAS DE CLIENTES ---
@app.get("/clientes/", response_model=List[ClienteResponse])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(Cliente).all()

@app.post("/clientes/", status_code=status.HTTP_201_CREATED)
def criar_cliente(cliente: ClienteCreate, db: Session = Depends(get_db)):
    novo_cliente = Cliente(nome=cliente.nome, telefone=cliente.telefone)
    db.add(novo_cliente)
    db.commit()
    db.refresh(novo_cliente)
    return {"mensagem": "Cliente cadastrado com sucesso!", "cliente": novo_cliente}

@app.put("/clientes/{cliente_id}")
def atualizar_cliente(cliente_id: int, cliente: ClienteCreate, db: Session = Depends(get_db)):
    cli_db = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cli_db:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    cli_db.nome = cliente.nome
    cli_db.telefone = cliente.telefone
    db.commit()
    db.refresh(cli_db)
    return {"mensagem": "Cliente atualizado com sucesso!", "cliente": cli_db}

@app.delete("/clientes/{cliente_id}")
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cli = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cli:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    db.delete(cli)
    db.commit()
    return {"mensagem": "Cliente excluído com sucesso"}

# --- ROTAS DE PEDIDOS (PDV) ---
@app.post("/pedidos/", status_code=status.HTTP_201_CREATED)
def criar_pedido(pedido: PedidoCreate, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == pedido.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    novo_pedido = Pedido(cliente_id=pedido.cliente_id)
    db.add(novo_pedido)
    db.flush() # Gera o ID do pedido

    for item in pedido.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto ID {item.produto_id} não encontrado")
        
        if produto.estoque < item.quantidade:
            raise HTTPException(status_code=400, detail=f"Estoque insuficiente para o produto: {produto.nome}")
        
        # Baixa no estoque
        produto.estoque -= item.quantidade

        novo_item = ItemPedido(
            pedido_id=novo_pedido.id,
            produto_id=produto.id,
            quantidade=item.quantidade,
            preco_venda=produto.preco
        )
        db.add(novo_item)

    db.commit()
    return {"mensagem": "Pedido realizado e estoque atualizado com sucesso!", "pedido_id": novo_pedido.id}

# --- ROTAS DE RELATÓRIOS (BI) ---
@app.get("/relatorios/produtos-mais-vendidos")
def produtos_mais_vendidos(db: Session = Depends(get_db)):
    resultados = db.query(
        Produto.nome,
        func.sum(ItemPedido.quantidade).label("quantidade_vendida"),
        func.sum(ItemPedido.quantidade * ItemPedido.preco_venda).label("total_em_reais")
    ).join(ItemPedido, Produto.id == ItemPedido.produto_id)\
     .group_by(Produto.id, Produto.nome)\
     .all()

    return [
        {
            "produto": r.nome,
            "quantidade_vendida": int(r.quantidade_vendida or 0),
            "total_em_reais": float(r.total_em_reais or 0)
        } for r in resultados
    ]

@app.get("/relatorios/clientes-fieis")
def clientes_fieis(db: Session = Depends(get_db)):
    resultados = db.query(
        Cliente.nome,
        func.count(Pedido.id).label("total_pedidos")
    ).join(Pedido, Cliente.id == Pedido.cliente_id)\
     .group_by(Cliente.id, Cliente.nome)\
     .all()

    return [
        {
            "cliente": r.nome,
            "total_pedidos": int(r.total_pedidos or 0)
        } for r in resultados
    ]