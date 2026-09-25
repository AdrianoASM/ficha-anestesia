# Ficha de Anestesia (PWA)

## 👉 Abrir o app: https://adrianoasm.github.io/ficha-anestesia/

Desenvolvido por **Adriano A S Mendonça**.

App web instalável para preencher a ficha de anestesia do CEA no tablet ou celular e gerar o PDF no layout da ficha em papel.

- Funciona offline depois do primeiro acesso.
- Os dados dos pacientes ficam **somente no aparelho**, criptografados com a senha do anestesista (AES-GCM). Este repositório contém apenas o programa.
- PDF gerado no próprio aparelho (jsPDF).

## Instalar no Android
Abra o endereço do app no Chrome → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

## Instalar no iPhone
Abra no Safari → botão Compartilhar → **Adicionar à Tela de Início**.

## Rodar localmente
```
python -m http.server 8765
```
e abra http://localhost:8765
