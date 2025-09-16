#!/bin/bash

# GigaID API Documentation Server
# This script serves the OpenAPI specification using Swagger UI

echo "🚀 GigaID API Documentation Server"
echo "=================================="

# Check if the OpenAPI spec exists
if [ ! -f "openapi-spec.yaml" ]; then
    echo "❌ openapi-spec.yaml not found!"
    echo "Please ensure the OpenAPI specification file is in the current directory."
    exit 1
fi

echo "📋 OpenAPI Specification: $(wc -l < openapi-spec.yaml) lines"
echo ""

# Method 1: Using Docker (Swagger UI)
if command -v docker &> /dev/null; then
    echo "🐳 Starting Swagger UI with Docker..."
    echo "📖 Documentation will be available at: http://localhost:8080"
    echo "🔗 Direct link: http://localhost:8080/?url=http://localhost:8080/openapi-spec.yaml"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    # Serve the spec file and Swagger UI
    docker run -d --rm --name gigaid-swagger \
        -p 8080:8080 \
        -v $(pwd)/openapi-spec.yaml:/usr/share/nginx/html/openapi-spec.yaml \
        -e SWAGGER_JSON=/usr/share/nginx/html/openapi-spec.yaml \
        swaggerapi/swagger-ui
    
    # Wait for container to start
    sleep 3
    
    # Try to open in browser
    if command -v open &> /dev/null; then
        open "http://localhost:8080/?url=http://localhost:8080/openapi-spec.yaml"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "http://localhost:8080/?url=http://localhost:8080/openapi-spec.yaml"
    fi
    
    echo "✅ Swagger UI is running!"
    echo "📖 View the documentation at: http://localhost:8080"
    echo ""
    echo "To stop the server, run: docker stop gigaid-swagger"
    
# Method 2: Using Python HTTP server (fallback)
elif command -v python3 &> /dev/null; then
    echo "🐍 Starting Python HTTP server..."
    echo "📁 Serving files at: http://localhost:8000"
    echo "📄 OpenAPI spec at: http://localhost:8000/openapi-spec.yaml"
    echo ""
    echo "To view in Swagger UI, go to: https://editor.swagger.io"
    echo "Then File > Import URL > http://localhost:8000/openapi-spec.yaml"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    # Try to open in browser
    if command -v open &> /dev/null; then
        open "https://editor.swagger.io"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "https://editor.swagger.io"
    fi
    
    python3 -m http.server 8000

else
    echo "❌ Neither Docker nor Python3 found!"
    echo ""
    echo "🔧 To view the API documentation, you can:"
    echo "1. Install Docker and run this script again"
    echo "2. Go to https://editor.swagger.io"
    echo "3. Upload the openapi-spec.yaml file"
    echo ""
    echo "📄 OpenAPI specification file: $(pwd)/openapi-spec.yaml"
fi 