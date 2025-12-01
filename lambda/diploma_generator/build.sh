#!/bin/bash
# Build script for Diploma Generator Lambda

set -e

echo "Building Diploma Generator Lambda deployment package..."

# Create build directory
BUILD_DIR="build"
PACKAGE_DIR="$BUILD_DIR/package"
rm -rf $BUILD_DIR
mkdir -p $PACKAGE_DIR

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt -t $PACKAGE_DIR --quiet

# Copy handler
echo "Copying handler..."
cp handler.py $PACKAGE_DIR/

# Create ZIP
echo "Creating deployment package..."
cd $PACKAGE_DIR
zip -r ../deployment.zip . -q
cd ../..

# Get ZIP size
ZIP_SIZE=$(du -h $BUILD_DIR/deployment.zip | cut -f1)
echo ""
echo "Build complete!"
echo "Deployment package: $BUILD_DIR/deployment.zip"
echo "Package size: $ZIP_SIZE"
echo ""
echo "To deploy with AWS CLI:"
echo "  aws lambda update-function-code --function-name diploma-generator --zip-file fileb://$BUILD_DIR/deployment.zip"
echo ""
echo "Or deploy with SAM:"
echo "  sam build && sam deploy --guided"


