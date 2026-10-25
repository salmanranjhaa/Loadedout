FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py keys.py ./

ENV MCP_PORT=8003

EXPOSE 8003

CMD ["python", "server.py"]
