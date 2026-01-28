#!/bin/bash

# Video Export Project Setup Script

echo "🚀 Setting up Video Export project..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "📚 Installing dependencies..."
pip install -r requirements.txt

# Install Jupyter kernel
echo "🔬 Installing Jupyter kernel..."
python -m ipykernel install --user --name=video-export --display-name="Video Export"

# Create output directories
echo "📁 Creating output directories..."
mkdir -p test_output
mkdir -p real_output

echo "✅ Setup complete!"
echo ""
echo "To get started:"
echo "1. Activate the virtual environment: source venv/bin/activate"
echo "2. Start Jupyter: jupyter notebook"
echo "3. Open video_export_test.ipynb"
echo "4. Select 'Video Export' kernel when prompted"
echo ""
echo "Happy coding! 🎬"

