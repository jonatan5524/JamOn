# LLM Service Integration Guide for GitHub Copilot

## Overview
This document provides comprehensive instructions for integrating with our LLM service. The service provides access to multiple LLM models through two API formats:

1. **Ollama API** - Native Ollama models (Llama, Mistral, Gemma, Qwen, MiniLM)
2. **OpenAI-compatible API** - GPT-OSS-120B (Advanced 120B parameter model)

## Service Architecture
- **Backend**: Ollama LLM server + GPT-OSS-120B API endpoint
- **Reverse Proxy**: Nginx with basic authentication and rate limiting
- **Access**: VPN required (internal network only)

## Base URLs and Endpoints
**HTTP URL**: http://10.10.248.41  
**DNS**: http://llm.cs.colman.ac.il  
**Access**: Requires VPN connection to internal network

### API Endpoints Overview

The service provides two types of API endpoints:

#### A. Ollama API Endpoints (for Llama, Mistral, Gemma, Qwen models)
- `/api/generate` - Generate text completions ✅ Working (6 models available)
- `/api/tags` - List available Ollama models ✅ Working
- `/api/embed` - Generate embeddings ✅ Working (all-minilm:latest)

#### B. OpenAI-Compatible API Endpoints (for GPT-OSS-120B)
- `/v1/chat/completions` - Chat completions (OpenAI format)
- `/v1/completions` - Text completions (OpenAI format)

---

## Ollama API Endpoints

### 1. Generate LLM Response
```http
POST /api/generate
Content-Type: application/json
Authorization: Basic <base64-encoded-credentials>
```
**Request Body:**
```json
{
  "model": "llama3.1:8b",
  "prompt": "Your prompt here",
  "stream": false,
  "format": "json",
  "options": {
    "temperature": 0.7,
    "top_p": 0.9,
    "num_predict": 1000
  }
}
```
**Required Fields:** `model`, `prompt`
**Optional Fields:** `stream`, `format`, `options` (containing temperature, top_p, num_predict, etc.)

**Response:**
```json
{
  "success": true,
  "response": "LLM generated response text",
  "model": "llama3.1:8b",
  "created_at": "2026-05-20T10:30:00Z",
  "done": true
}
```

### 2. List Available Ollama Models
```http
GET /api/tags
Authorization: Basic <base64-encoded-credentials>
```
**Response:**
```json
{
  "models": [
    {
      "name": "llama3.1:8b",
      "modified_at": "2026-05-20T10:30:00Z",
      "size": 4661211808,
      "digest": "sha256:abc123...",
      "details": {
        "format": "gguf",
        "family": "llama"
      }
    }
  ]
}
```

### 3. Generate Embeddings

```http
POST /api/embed
Content-Type: application/json
Authorization: Basic <base64-encoded-credentials>
```
**Request Body:**
```json
{
  "model": "all-minilm:latest",
  "input": "Your text to embed here"
}
```
**Required Fields:** `model`, `input`

**Response:**
```json
{
  "model": "all-minilm:latest",
  "embeddings": [
    [-0.0035236033, 0.005760953, 0.0485043, ...]
  ]
}
```

**Note:** The response contains an `embeddings` array (note the plural) with the embedding vector. Use model name `all-minilm:latest` (confirmed available via `/api/tags`).

---

## OpenAI-Compatible API Endpoints

### GPT-OSS-120B Model
The service includes access to a powerful 120 billion parameter model (GPT-OSS-120B) using OpenAI-compatible API format.

### 1. Chat Completions (Recommended)
```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Basic <base64-encoded-credentials>
```
**Request Body:**
```json
{
  "model": "gpt-oss-120b",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Explain quantum computing"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-oss-120b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing is..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 150,
    "total_tokens": 175
  }
}
```

### 2. Text Completions
```http
POST /v1/completions
Content-Type: application/json
Authorization: Basic <base64-encoded-credentials>
```
**Request Body:**
```json
{
  "model": "gpt-oss-120b",
  "prompt": "Write a Python function that",
  "temperature": 0.7,
  "max_tokens": 500
}
```

### cURL Examples for OpenAI API
```bash
# Chat completion with GPT-OSS-120B
curl -X POST http://10.10.248.41/v1/chat/completions \
  -u "student1:pass123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss-120b",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain machine learning"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'

# Text completion
curl -X POST http://10.10.248.41/v1/completions \
  -u "student1:pass123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss-120b",
    "prompt": "Write a Python function that sorts a list",
    "max_tokens": 500
  }'
```

### Python Example with OpenAI API
```python
import requests
import base64

class GPTClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json'
        }
    
    def chat_completion(self, messages, temperature=0.7, max_tokens=1000):
        url = f"{self.base_url}/v1/chat/completions"
        data = {
            'model': 'gpt-oss-120b',
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens
        }
        response = requests.post(url, json=data, headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage
client = GPTClient('http://10.10.248.41', 'student1', 'pass123')
messages = [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Write a Python function to calculate fibonacci numbers"}
]
result = client.chat_completion(messages)
print(result['choices'][0]['message']['content'])
```

---

## Ollama API - Additional Examples

### Example cURL Request for Embeddings
```bash
curl -X POST http://10.10.248.41/api/embed \
  -u "student1:pass123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "all-minilm:latest",
    "input": "Your text to embed here"
  }'
```

#### Python Example for Embeddings
```python
import requests
import base64

class EmbeddingClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json'
        }
    def get_embedding(self, model, text):
        url = f"{self.base_url}/api/embed"
        data = {
            'model': model,
            'input': text  # Note: Ollama uses 'input', not 'prompt'
        }
        response = requests.post(url, json=data, headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage
client = EmbeddingClient('http://10.10.248.41', 'student1', 'pass123')
result = client.get_embedding('all-minilm:latest', 'Text to embed')
print(result['embeddings'][0])  # Note: embeddings is an array
```




## Authentication
The service uses HTTP Basic Authentication through the nginx proxy. Include the `Authorization` header with base64-encoded credentials.

### Available Test Credentials:
```
admin / admin123      (Administrator)
student1 / pass123    (John Cohen)
student2 / mypass456  (Sarah Levy) 
student3 / secure789  (David Israel)
student4 / code2024   (Michelle David)
teacher1 / teach999   (Dr. Rachel Gold)
```

### Creating Authorization Header:
```python
import base64
username = "student1"
password = "pass123"
credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
auth_header = f"Basic {credentials}"
```

## Error Responses
Error responses follow standard HTTP status codes with JSON error details:
```json
{
  "error": "Error description"
}
```

**Common Error Codes:**
- `400`: Bad request (invalid JSON, missing fields)
- `401`: Authentication failed (invalid credentials)
- `404`: Model not found
- `429`: Rate limit exceeded (too many requests)
- `500`: Internal server error
- `503`: Service unavailable

## Model Information

### Available Models:

#### Ollama Models (Native API)
- **llama3.1:8b** - Meta's Llama 3.1, 8B parameters
  - Best for: General purpose, coding, reasoning
  - Size: ~4.9 GB
  - Response time: ~0.5s
  - Access via: `/api/generate`
  
- **mistral:latest** - Mistral AI model, 7.2B parameters
  - Best for: Fast responses, multilingual
  - Size: ~4.4 GB
  - Response time: ~0.5s
  - Access via: `/api/generate`
  
- **gemma2:9b** - Google's Gemma 2, 9B parameters
  - Best for: Instruction following, code generation
  - Size: ~5.4 GB
  - Response time: ~0.5s
  - Access via: `/api/generate`

- **gemma3:12b** - Google's Gemma 3, 12B parameters
  - Best for: Advanced reasoning, complex tasks
  - Size: ~8.1 GB
  - Response time: ~4s
  - Access via: `/api/generate`

- **qwen2.5-coder:32b** - Qwen 2.5 Coder, 32.8B parameters
  - Best for: Code generation, debugging, programming
  - Size: ~19.8 GB
  - Response time: ~0.2s (optimized)
  - Access via: `/api/generate`

- **all-minilm:latest** - Sentence transformer, 23M parameters
  - Best for: Text embeddings only
  - Size: ~46 MB
  - Response time: <0.1s
  - Access via: `/api/embed` (embeddings only, not for text generation)

#### OpenAI-Compatible Models
- **gpt-oss-120b** - GPT-OSS 120B parameter model
  - Best for: Most complex tasks, highest quality responses
  - Parameters: 120 billion
  - Access via: `/v1/chat/completions` or `/v1/completions`
  - Note: Slower response time due to model size

### Model Selection Guidelines:

**For Quick Responses:**
- Use `llama3.1:8b` or `mistral:latest` (Ollama API)
- Response time: 0.5-1 seconds

**For Code Generation:**
- Use `qwen2.5-coder:32b` (Ollama API) - Specialized coding model
- Or `gemma2:9b` for general code tasks
- Good balance of quality and speed

**For Complex Reasoning/Analysis:**
- Use `gpt-oss-120b` (OpenAI API)
- Best quality but slower (10-30 seconds)
- Ideal for academic research, detailed explanations

**For Text Embeddings:**
- Use `all-minilm:latest` (Ollama API)
- 384-dimensional vectors
- Very fast (<0.1s)

**For Simple Tasks:**
- Use `llama3.1:8b` or `mistral:latest` (Ollama API)
- Fast and efficient

Check currently available Ollama models with the `/api/tags` endpoint

## Integration Examples

### Python Integration Example:
```python
import requests
import json
import base64

class LLMServiceClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json'
        }
    
    def generate_response(self, model, prompt, **options):
        """Generate response from LLM"""
        url = f"{self.base_url}/api/generate"
        data = {
            'model': model,
            'prompt': prompt,
            'options': options
        }
        
        response = requests.post(url, json=data, headers=self.headers)
        response.raise_for_status()
        return response.json()
    
    def list_models(self):
        """Get available models"""
        url = f"{self.base_url}/api/tags"
        
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage
client = LLMServiceClient('http://10.10.248.41', 'student1', 'pass123')
result = client.generate_response('llama3.1:8b', 'Explain quantum computing')
print(result['response'])
```

### JavaScript/Node.js Integration Example:
```javascript
class LLMServiceClient {
    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        const credentials = btoa(`${username}:${password}`);
        this.headers = {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
        };
    }
    
    async generateResponse(model, prompt, options = {}) {
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                model,
                prompt,
                options
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }
    
    async listModels() {
        const response = await fetch(`${this.baseUrl}/api/tags`, {
            headers: this.headers
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }
}

// Usage
const client = new LLMServiceClient('http://10.10.248.41', 'student1', 'pass123');
const result = await client.generateResponse('llama3.1:8b', 'Write a Python function');
console.log(result.response);
```

### cURL Examples:
```bash
# Generate response
curl -X POST http://10.10.248.41/api/generate \
  -u "student1:pass123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "prompt": "Explain machine learning",
    "options": {
      "temperature": 0.7
    }
  }'

# List models
curl -u "student1:pass123" http://10.10.248.41/api/tags

# Alternative with explicit Authorization header
curl -X POST http://10.10.248.41/api/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'student1:pass123' | base64)" \
  -d '{
    "model": "llama3.1:8b",
    "prompt": "Explain machine learning",
    "options": {
      "temperature": 0.7
    }
  }'
```

## Best Practices for Copilot Integration

### 1. Error Handling
Handle HTTP status codes and check for error messages:
```python
try:
    result = client.generate_response(model, prompt)
    print(result['response'])
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401:
        print("Authentication failed")
    elif e.response.status_code == 429:
        print("Rate limit exceeded. Please wait before retrying.")
        retry_after = e.response.headers.get('Retry-After', 60)
        time.sleep(int(retry_after))
    else:
        error_data = e.response.json()
        print(f"Error: {error_data.get('error', 'Unknown error')}")
```

### 2. Model Selection Strategy
```python
# Check available models first
models = client.list_models()
available_models = [m['name'] for m in models['models']]

# Use available model (llama3.1:8b is currently installed)
preferred_models = ['llama3.1:8b', 'llama3.2:1b', 'phi3:3.8b', 'gemma2:2b']
selected_model = next((m for m in preferred_models if m in available_models), available_models[0])
```

### 3. Prompt Optimization
- Keep prompts concise but specific
- Use temperature 0.1-0.3 for factual responses
- Use temperature 0.7-0.9 for creative responses
- Set `num_predict` in options to limit response length
- Use `format: "json"` for structured responses

### 4. Rate Limiting
The service has endpoint-specific rate limiting:
- **Ollama Generate** (`/api/generate`): 5 requests per minute per IP
- **Ollama Embeddings** (`/api/embed`): 10 requests per minute per IP
- **OpenAI API** (`/v1/*`): 5 requests per minute per IP
- **Model operations** (`/api/tags`, `/api/pull`): 20 requests per minute per IP  
- **General API**: 10 requests per minute per IP (fallback)
- **Health check** (`/api/health`): No rate limiting

Implement exponential backoff for retries and handle 429 errors.

**Note:** GPT-OSS-120B has the same rate limit but naturally processes slower due to model size.

### 5. Streaming Support
For real-time responses, set `"stream": true` and handle line-delimited JSON responses.

## Network Configuration

### Firewall Ports
- Port 80 (HTTP, redirects to HTTPS)
- Port 443 (HTTPS, nginx proxy)
- Port 11434 (Ollama, internal only)

### Security Headers
The service includes standard security headers:
- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `X-XSS-Protection`

## Troubleshooting

### Common Issues:
1. **Connection refused**: Check if server is running and ports are open
2. **Authentication failed**: Verify username/password in student registry
3. **Model not found**: Check available models with `/api/tags`
4. **Timeout errors**: LLM processing can be slow; increase timeout values
5. **Rate limiting (429 errors)**: Wait 60 seconds between requests, implement exponential backoff

### Health Check:
```bash
curl https://your-domain.com/health
# Should return: "healthy"
```

### Debug Mode:
Check server logs for detailed error information when troubleshooting integration issues.

## Using Both API Types in One Application

You can combine both Ollama and OpenAI APIs based on your needs:

```python
class UnifiedLLMClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json'
        }
    
    def quick_response(self, prompt):
        """Use Ollama for fast responses"""
        url = f"{self.base_url}/api/generate"
        data = {'model': 'llama3.1:8b', 'prompt': prompt}
        return requests.post(url, json=data, headers=self.headers).json()
    
    def advanced_response(self, messages):
        """Use GPT-OSS-120B for complex tasks"""
        url = f"{self.base_url}/v1/chat/completions"
        data = {'model': 'gpt-oss-120b', 'messages': messages}
        return requests.post(url, json=data, headers=self.headers).json()

# Usage
client = UnifiedLLMClient('http://10.10.248.41', 'student1', 'pass123')

# Fast query
quick = client.quick_response('What is 2+2?')
print(quick['response'])

# Complex query
advanced = client.advanced_response([
    {"role": "user", "content": "Explain quantum entanglement in detail"}
])
print(advanced['choices'][0]['message']['content'])
```

## Web Interface

In addition to API access, a web interface is available at:
- **URL**: http://10.10.248.41 or http://llm.cs.colman.ac.il
- **Login**: Use the same credentials (e.g., admin/admin123, student1/pass123)
- **Features**: 
  - Interactive chat interface
  - Model selection dropdown (includes all models)
  - Adjustable parameters (temperature, max tokens, etc.)
  - JSON response format option
  - Response history

## Support and Maintenance
- Monitor server resources (RAM, CPU, disk space)
- Models require significant disk space (1-10GB each)
- Regular backups of student registry and configurations
- VPN access required for all connections
- Service available 24/7 on internal network

## FAQ

**Q: Which model should I use?**
A: For most tasks, start with `llama3.1:8b`. For code generation, use `qwen2.5-coder:32b`. Use `gpt-oss-120b` only for complex analysis that requires the highest quality.

**Q: What's the best model for coding?**
A: Use `qwen2.5-coder:32b` - it's a 32.8B parameter model optimized specifically for code generation, debugging, and programming tasks. Despite its size, it's very fast (~0.2s response time).

**Q: Why is GPT-OSS-120B slower?**
A: It has 120 billion parameters (15x larger than llama3.1:8b), requiring more computation time.

**Q: Can I use the OpenAI Python library?**
A: Yes! Set the base URL to `http://10.10.248.41/v1` and use model name `gpt-oss-120b`.

**Q: How do I handle rate limits?**
A: Implement exponential backoff and catch 429 status codes. Wait 60 seconds before retrying.

**Q: Is streaming supported?**
A: Yes, set `"stream": true` in Ollama API. OpenAI API streaming is also supported.

---

**Note**: This service is designed for educational use at Colman College. Access requires VPN connection to the internal network and valid student credentials. Both Ollama and OpenAI-compatible APIs are provided for maximum flexibility.