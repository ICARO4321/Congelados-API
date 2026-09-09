from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sistema Congelados e Cia")

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

# --- ESQUEMAS (Pydantic) ---
class ProdutoCreate(BaseModel):
    nome: str
    preco: float
    estoque: int

class ClienteCreate(BaseModel):
    nome: str
    telefone: str

class ItemPedidoCreate(BaseModel):
    produto_id: int
    quantidade: int

class PedidoCreate(BaseModel):
    cliente_id: int
    itens: list[ItemPedidoCreate]


# --- ROTAS DE PRODUTOS ---
@app.post("/produtos/", status_code=201)
def criar_produto(produto: ProdutoCreate, db: Session = Depends(get_db)):
    novo_produto = models.Produto(nome=produto.nome, preco=produto.preco, estoque=produto.estoque)
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    return {"mensagem": "Produto cadastrado com sucesso!", "produto": novo_produto}

@app.get("/produtos/")
def listar_produtos(db: Session = Depends(get_db)):
    return db.query(models.Produto).all()

@app.delete("/produtos/{produto_id}")
def excluir_produto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    db.delete(produto)
    db.commit()
    return {"mensagem": "Produto excluído com sucesso"}


# --- ROTAS DE CLIENTES ---
@app.post("/clientes/", status_code=201)
def criar_cliente(cliente: ClienteCreate, db: Session = Depends(get_db)):
    novo_cliente = models.Cliente(nome=cliente.nome, telefone=cliente.telefone)
    db.add(novo_cliente)
    db.commit()
    db.refresh(novo_cliente)
    return {"mensagem": "Cliente cadastrado com sucesso!", "cliente": novo_cliente}

@app.get("/clientes/")
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).all()

@app.delete("/clientes/{cliente_id}")
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    db.delete(cliente)
    db.commit()
    return {"mensagem": "Cliente excluído com sucesso"}


# --- ROTAS DE PEDIDOS ---
@app.post("/pedidos/", status_code=201)
def criar_pedido(pedido: PedidoCreate, db: Session = Depends(get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == pedido.cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    novo_pedido = models.Pedido(cliente_id=pedido.cliente_id, status="Concluído")
    db.add(novo_pedido)
    db.commit()
    db.refresh(novo_pedido)

    for item in pedido.itens:
        produto = db.query(models.Produto).filter(models.Produto.id == item.produto_id).first()
        if not produto:
            raise HTTPException(status_code=404, detail=f"Produto ID {item.produto_id} não encontrado")
        
        if produto.estoque < item.quantidade:
            raise HTTPException(status_code=400, detail=f"Estoque insuficiente para o produto: {produto.nome}")

        produto.estoque -= item.quantidade

        novo_item = models.ItemPedido(
            pedido_id=novo_pedido.id,
            produto_id=produto.id,
            quantidade=item.quantidade,
            preco_unitario=produto.preco
        )
        db.add(novo_item)

    db.commit()
    return {"mensagem": "Pedido realizado com sucesso!", "pedido_id": novo_pedido.id}


# --- ROTAS DE RELATÓRIOS ---
@app.get("/relatorios/produtos-mais-vendidos")
def produtos_mais_vendidos(db: Session = Depends(get_db)):
    resultados = (
        db.query(
            models.Produto.nome,
            func.sum(models.ItemPedido.quantidade).label("total_quantidade"),
            func.sum(models.ItemPedido.quantidade * models.ItemPedido.preco_unitario).label("total_reais")
        )
        .join(models.ItemPedido, models.Produto.id == models.ItemPedido.produto_id)
        .group_by(models.Produto.id, models.Produto.nome)
        .order_by(func.sum(models.ItemPedido.quantidade * models.ItemPedido.preco_unitario).desc())
        .all()
    )
    
    return [
        {
            "produto": r.nome,
            "quantidade_vendida": r.total_quantidade,
            "total_em_reais": float(r.total_reais)
        }
        for r in resultados
    ]

@app.get("/relatorios/clientes-fieis")
def clientes_fieis(db: Session = Depends(get_db)):
    resultados = (
        db.query(
            models.Cliente.nome,
            func.count(models.Pedido.id).label("total_pedidos")
        )
        .join(models.Pedido, models.Cliente.id == models.Pedido.cliente_id)
        .group_by(models.Cliente.id, models.Cliente.nome)
        .order_by(func.count(models.Pedido.id).desc())
        .all()
    )

    return [
        {
            "cliente": r.nome,
            "total_pedidos": r.total_pedidos
        }
        for r in resultados
    ]