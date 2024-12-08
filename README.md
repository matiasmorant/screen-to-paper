# PDF Layout Tool

A web application for manipulating PDF page layouts with multiple options.

## Features

- Upload and process PDF files
- Three layout options:
  1. 1-up: Original layout
  2. 2-up: Two pages per sheet, rotated and scaled
  3. 4-up: Four pages per sheet in a grid layout

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Web Interface

1. Run the web server:
```bash
python main.py
```
2. Open your browser to `http://localhost:5000`
3. Upload a PDF and select your desired layout option
4. Download the processed PDF

### Command Line Tool

For quick 2-up processing, use the command line tool:
```bash
python make_2up.py input.pdf
```
Or simply run in a directory with PDFs:
```bash
python make_2up.py
```

## Project Structure

- `main.py`: Web application server
- `make_2up.py`: Command line tool for 2-up layout
- `templates/index.html`: Web interface template
- `uploads/`: Temporary storage for processing files (created automatically)

## Technical Details

- Uses Flask for web interface
- PDF processing with pypdf library
- Supports various page transformations:
  - Rotation
  - Scaling
  - Position adjustment
- Maintains original page dimensions
- Automatic cleanup of temporary files

## License

MIT License

## Contributing

Feel free to open issues or submit pull requests!
