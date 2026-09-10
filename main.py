import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Numeric, ForeignKey, DateTime, Text, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from typing import List, Optional
from datetime import datetime

# Usa a pasta /tmp no Render para evitar erro 500 por falta de permissão de escrita no disco
DATABASE_URL = "sqlite:///./congelados.db" if not os.environ.get("RENDER") else "sqlite:////tmp/congelados.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS DO BANCO ---
class Produto(Base):
    __tablename__ = "produtos"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    preco = Column(Numeric(10, 2), nullable=False)
    estoque = Column(Integer, nullable=False, default=0)
    foto = Column(String, nullable=True)

class Cliente(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    telefone = Column(String(30), nullable=True)
    cnpj = Column(String(40), nullable=True)
    endereco = Column(String(255), nullable=True)
    cidade = Column(String(100), nullable=True)
    observacao = Column(Text, nullable=True)

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

# Força a criação das tabelas ao iniciar
Base.metadata.create_all(bind=engine)

# --- SCHEMAS ---
class ProdutoCreate(BaseModel):
    nome: str
    preco: float
    estoque: int
    foto: Optional[str] = None

class ProdutoResponse(ProdutoCreate):
    id: int
    class Config:
        from_attributes = True

class ClienteCreate(BaseModel):
    nome: str
    telefone: Optional[str] = None
    cnpj: Optional[str] = None
    endereco: Optional[str] = None
    cidade: Optional[str] = None
    observacao: Optional[str] = None

class ClienteResponse(ClienteCreate):
    id: int
    class Config:
        from_attributes = True

class ItemPedidoCreate(BaseModel):
    produto_id: int
    quantidade: int

class PedidoCreate(BaseModel):
    cliente_id: int
    itens: List[ItemPedidoCreate]

class ItemPedidoResponse(BaseModel):
    produto_id: int
    quantidade: int
    preco_venda: float
    class Config:
        from_attributes = True

class PedidoResponse(BaseModel):
    id: int
    cliente_id: int
    data_criacao: datetime
    status: str
    itens: List[ItemPedidoResponse]
    class Config:
        from_attributes = True

# --- APP ---
app = FastAPI(title="Congelados e Cia API", version="2.5")

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

@app.get("/")
def raiz():
    return {"status": "API rodando com sucesso!"}

@app.get("/produtos/", response_model=List[ProdutoResponse])
def listar_produtos(db: Session = Depends(get_db)):
    try:
        return db.query(Produto).all()
    except Exception:
        Base.metadata.create_all(bind=engine)
        return []

@app.post("/produtos/", status_code=status.HTTP_201_CREATED)
def criar_produto(produto: ProdutoCreate, db: Session = Depends(get_db)):
    novo_produto = Produto(nome=produto.nome, preco=produto.preco, estoque=produto.estoque, foto=produto.foto)
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    return {"mensagem": "Produto cadastrado!", "produto": novo_produto}

@app.get("/clientes/", response_model=List[ClienteResponse])
def listar_clientes(db: Session = Depends(get_db)):
    try:
        return db.query(Cliente).all()
    except Exception:
        Base.metadata.create_all(bind=engine)
        return []

@app.post("/clientes/", status_code=status.HTTP_201_CREATED)
def criar_cliente(cliente: ClienteCreate, db: Session = Depends(get_db)):
    novo_cliente = Cliente(
        nome=cliente.nome,
        telefone=cliente.telefone,
        cnpj=cliente.cnpj,
        endereco=cliente.endereco,
        cidade=cliente.cidade,
        observacao=cliente.observacao
    )
    db.add(novo_cliente)
    db.commit()
    db.refresh(novo_cliente)
    return {"mensagem": "Cliente cadastrado com sucesso!", "cliente": novo_cliente}

@app.put("/clientes/{cliente_id}")
def atualizar_cliente(cliente_id: int, cliente: ClienteCreate, db: Session = Depends(get_db)):
    cli_db = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cli_db: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    cli_db.nome = cliente.nome
    cli_db.telefone = cliente.telefone
    cli_db.cnpj = cliente.cnpj
    cli_db.endereco = cliente.endereco
    cli_db.cidade = cliente.cidade
    cli_db.observacao = cliente.observacao
    db.commit()
    db.refresh(cli_db)
    return {"mensagem": "Cliente atualizado com sucesso!", "cliente": cli_db}

@app.delete("/clientes/{cliente_id}")
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cli = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cli: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    db.delete(cli)
    db.commit()
    return {"mensagem": "Cliente excluído"}

@app.get("/pedidos/", response_model=List[PedidoResponse])
def listar_pedidos(db: Session = Depends(get_db)):
    try:
        return db.query(Pedido).order_by(Pedido.data_criacao.asc()).all()
    except:
        return []

@app.post("/pedidos/", status_code=status.HTTP_201_CREATED)
def criar_pedido(pedido: PedidoCreate, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == pedido.cliente_id).first()
    if not cliente: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    novo_pedido = Pedido(cliente_id=pedido.cliente_id)
    db.add(novo_pedido)
    db.flush() 

    for item in pedido.itens:
        produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
        if not produto: raise HTTPException(status_code=404, detail="Produto não encontrado")
        if produto.estoque < item.quantidade: raise HTTPException(status_code=400, detail="Estoque insuficiente")
        produto.estoque -= item.quantidade
        novo_item = ItemPedido(pedido_id=novo_pedido.id, produto_id=produto.id, quantidade=item.quantidade, preco_venda=produto.preco)
        db.add(novo_item)

    db.commit()
    db.refresh(novo_pedido)
    return {"mensagem": "Pedido realizado!", "pedido": novo_pedido}

@app.get("/relatorios/produtos-mais-vendidos")
def produtos_mais_vendidos(db: Session = Depends(get_db)):
    try:
        resultados = db.query(Produto.nome, func.sum(ItemPedido.quantidade).label("quantidade_vendida"), func.sum(ItemPedido.quantidade * ItemPedido.preco_venda).label("total_em_reais")).join(ItemPedido, Produto.id == ItemPedido.produto_id).group_by(Produto.id, Produto.nome).all()
        return [{"produto": r.nome, "quantidade_vendida": int(r.quantidade_vendida or 0), "total_em_reais": float(r.total_em_reais or 0)} for r in resultados]
    except:
        return []

@app.get("/relatorios/clientes-fieis")
def clientes_fieis(db: Session = Depends(get_db)):
    try:
        resultados = db.query(Cliente.nome, func.count(Pedido.id).label("total_pedidos")).join(Pedido, Cliente.id == Pedido.cliente_id).group_by(Cliente.id, Cliente.nome).all()
        return [{"cliente": r.nome, "total_pedidos": int(r.total_pedidos or 0)} for r in resultados]
    except:
        return []