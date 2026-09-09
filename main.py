from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models
import database

# Cria as tabelas no banco de dados SQLite
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# Configuração de CORS para permitir acesso de qualquer frontend (Vercel, Local, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def raiz():
    return {"mensagem": "API do Sistema Congelados e Cia rodando com sucesso!"}

# ==================== ROTAS DE PRODUTOS ====================
@app.get("/produtos")
def listar_produtos(db: Session = Depends(get_db)):
    return db.query(models.Produto).all()

@app.post("/produtos")
def criar_produto(produto: models.ProdutoSchema, db: Session = Depends(get_db)):
    novo_produto = models.Produto(**produto.dict())
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    return novo_produto

@app.delete("/produtos/{produto_id}")
def excluir_produto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    db.delete(produto)
    db.commit()
    return {"mensagem": "Produto excluído com sucesso"}


# ==================== ROTAS DE CLIENTES ====================
@app.get("/clientes")
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).all()

@app.post("/clientes")
def criar_cliente(cliente: models.ClienteSchema, db: Session = Depends(get_db)):
    novo_cliente = models.Cliente(**cliente.dict())
    db.add(novo_cliente)
    db.commit()
    db.refresh(novo_cliente)
    return novo_cliente

@app.delete("/clientes/{cliente_id}")
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    db.delete(cliente)
    db.commit()
    return {"mensagem": "Cliente excluído com sucesso"}


# ==================== ROTAS DE VENDAS ====================
@app.get("/vendas")
def listar_vendas(db: Session = Depends(get_db)):
    return db.query(models.Venda).all()

@app.post("/vendas")
def criar_venda(venda: models.VendaSchema, db: Session = Depends(get_db)):
    nova_venda = models.Venda(**venda.dict())
    db.add(nova_venda)
    db.commit()
    db.refresh(nova_venda)
    return nova_venda

@app.delete("/vendas/{venda_id}")
def excluir_venda(venda_id: int, db: Session = Depends(get_db)):
    venda = db.query(models.Venda).filter(models.Venda.id == venda_id).first()
    if not venda:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    db.delete(venda)
    db.commit()
    return {"mensagem": "Venda excluída com sucesso"}