"""
Paper Review Dashboard
----------------------

This script implements a minimal web dashboard for the Research Paper
Review Agent. It uses only Python's standard library (plus the
dependencies required by paper_review_agent.py) to provide a simple,
deployable HTTP interface. Users can upload one or more PDF files,
select which sections to summarise, choose the number of sentences per
summary, and then view the extracted metadata, section summaries and
comparisons directly in their browser. The dashboard also allows
downloading the generated Markdown report.

To run the dashboard locally:

```bash
python paper_review_dashboard.py --port 8000
```

Then open a browser and navigate to http://localhost:8000 to access the
interface. The dashboard is intentionally simple and does not depend on
external frameworks, making it suitable for deployment in restricted
environments.
"""

import argparse
import io
import os
import tempfile
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
import cgi

from paper_review_agent import (
    download_nltk_resources,
    summarise_paper,
    compare_summaries,
    generate_markdown_report,
)


class PaperReviewHandler(BaseHTTPRequestHandler):
    """
    HTTP request handler that serves the paper review dashboard.
    """

    # Define the HTML template for the upload form
    FORM_HTML = """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Research Paper Review Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
          .container { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h1 { margin-top: 0; }
          input[type=number] { width: 60px; }
          .results { margin-top: 40px; }
          .paper { margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          .paper:last-child { border-bottom: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Research Paper Review Dashboard</h1>
          <p>Upload PDF files, select sections to summarise and choose the number of sentences. Then click <strong>Analyze</strong> to generate summaries and comparison.</p>
          <form action="/upload" method="post" enctype="multipart/form-data">
            <label for="pdfs">Select PDF files:</label><br>
            <input id="pdfs" type="file" name="pdfs" multiple required><br><br>
            <label for="sections">Select sections to summarise:</label><br>
            <select id="sections" name="sections" multiple size="6">
              <option value="abstract" selected>Abstract</option>
              <option value="introduction" selected>Introduction</option>
              <option value="methods" selected>Methods</option>
              <option value="results" selected>Results</option>
              <option value="discussion" selected>Discussion</option>
              <option value="conclusions" selected>Conclusions</option>
            </select><br><br>
            <label for="sentences">Number of sentences per summary:</label>
            <input id="sentences" type="number" name="sentences" min="1" max="10" value="3"><br><br>
            <input type="submit" value="Analyze">
          </form>
          <p style="margin-top:20px;">
            <em>Note: processing large PDFs may take some time depending on server resources.</em>
          </p>
        </div>
      </body>
    </html>
    """

    def _send_response(self, status_code: int, content: bytes, content_type: str = "text/html") -> None:
        """Utility to send HTTP responses with appropriate headers."""
        self.send_response(status_code)
        self.send_header("Content-type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        """Handle GET requests for the dashboard and report download."""
        parsed_path = urlparse(self.path)
        if parsed_path.path == "/" or parsed_path.path == "/index.html":
            # Serve the upload form
            self._send_response(HTTPStatus.OK, self.FORM_HTML.encode("utf-8"))
        elif parsed_path.path == "/download" and "file" in parse_qs(parsed_path.query):
            # Serve the generated report for download
            query = parse_qs(parsed_path.query)
            file_path = query["file"][0]
            if os.path.isfile(file_path):
                # Read and serve the file as attachment
                with open(file_path, "rb") as f:
                    data = f.read()
                filename = os.path.basename(file_path)
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f"attachment; filename={filename}")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self._send_response(HTTPStatus.NOT_FOUND, b"File not found.")
        else:
            self._send_response(HTTPStatus.NOT_FOUND, b"Not Found")

    def do_POST(self) -> None:
        """Handle POST requests for file uploads and analysis."""
        if self.path != "/upload":
            self._send_response(HTTPStatus.NOT_FOUND, b"Not Found")
            return
        # Parse form data
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers["Content-Type"],
            },
        )
        pdf_fields = form.getlist("pdfs")
        sections = form.getlist("sections")
        sentences_str = form.getfirst("sentences", "3")
        try:
            n_sentences = max(1, min(10, int(sentences_str)))
        except ValueError:
            n_sentences = 3
        # Ensure sections list is not empty
        if not sections:
            sections = ["abstract", "introduction", "methods", "results", "discussion", "conclusions"]
        # Prepare analysis
        download_nltk_resources()
        analysis_results = {}
        summaries_list = []
        # Create a temporary directory for uploaded files
        with tempfile.TemporaryDirectory() as tmpdir:
            for item in pdf_fields:
                # Each item is a FieldStorage object; store it temporarily
                if not item.filename:
                    continue
                filename = os.path.basename(item.filename)
                temp_path = os.path.join(tmpdir, filename)
                # Write the uploaded file to disk
                with open(temp_path, "wb") as f:
                    data = item.file.read()
                    f.write(data)
                # Analyse the PDF
                try:
                    result = summarise_paper(temp_path, sections, n_sentences)
                except Exception as e:
                    # If analysis fails, record the error
                    result = {
                        "metadata": {"title": filename, "authors": "", "year": ""},
                        "summaries": {section: f"Error analysing file: {e}" for section in sections},
                    }
                analysis_results[filename] = result
                summaries_list.append((filename, result.get("summaries", {})))
        # Generate comparison text
        comparison_text = compare_summaries(summaries_list)
        # Create a report file in a persistent location
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        report_filename = f"report_{timestamp}.md"
        report_path = os.path.join(tempfile.gettempdir(), report_filename)
        generate_markdown_report(
            analysis_results, sections, comparison_text, report_path
        )
        # Build HTML to display results
        html_parts = [
            "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
            "<title>Analysis Results</title>",
            "<style>body{font-family:Arial, sans-serif;margin:40px;background:#f5f5f5;}",
            ".container{background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);} ",
            ".paper{margin-bottom:20px;border-bottom:1px solid #ccc;padding-bottom:10px;} ",
            ".paper:last-child{border-bottom:none;} ",
            "</style></head><body><div class='container'>",
            "<h1>Analysis Results</h1>",
            "<p><a href='/'>Back to upload</a></p>",
        ]
        # Iterate over papers and display metadata and summaries
        for paper_id, result in analysis_results.items():
            meta = result.get("metadata", {})
            summaries = result.get("summaries", {})
            html_parts.append(f"<div class='paper'><h2>{paper_id}</h2>")
            title = meta.get("title", "(Title not found)")
            authors = meta.get("authors", "(Authors not found)")
            year = meta.get("year", "(Year not found)")
            html_parts.append(f"<p><strong>Title:</strong> {title}<br><strong>Authors:</strong> {authors}<br><strong>Year:</strong> {year}</p>")
            html_parts.append("<ul>")
            for section in sections:
                summary = summaries.get(section, "")
                if summary:
                    html_parts.append(f"<li><strong>{section.title()}</strong>: {cgi.escape(summary)}</li>")
                else:
                    html_parts.append(f"<li><strong>{section.title()}</strong>: (Section not found.)</li>")
            html_parts.append("</ul></div>")
        # Comparison section
        html_parts.append("<h2>Comparison of papers</h2>")
        html_parts.append(f"<pre>{cgi.escape(comparison_text)}</pre>")
        # Report download link
        html_parts.append(
            f"<p><a href='/download?file={report_path}'>Download Markdown Report</a></p>"
        )
        html_parts.append("</div></body></html>")
        html_content = "".join(html_parts)
        self._send_response(HTTPStatus.OK, html_content.encode("utf-8"))


def run_server(port: int) -> None:
    server_address = ("", port)
    httpd = HTTPServer(server_address, PaperReviewHandler)
    print(f"Serving on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
    finally:
        httpd.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the research paper review dashboard.")
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port number on which to run the HTTP server (default: 8000)",
    )
    args = parser.parse_args()
    run_server(args.port)


if __name__ == "__main__":
    main()