import os
import datetime
from pathlib import Path

def print_project_summary(root_path=".", output_file="Project_structure.txt"):
    """
    Collect and print project summary including total folders, files, lines of code,
    bytes, and a visual directory tree structure. Outputs to console and a text file.
    """
    root_path = Path(root_path)

    # 🚫 Directories to ignore
    ignore_dirs = {
        '__pycache__', '.git', '.vscode', '.idea', 'node_modules', 
        '.pytest_cache', '.mypy_cache', 'venv', '.venv', 'env',
        'dist', 'build', '.next', '.nuxt', 'ui', '.ipynb_checkpoints',
        'key', 'keys', 'keys_auth', 'schema', 'schemas',
        'Administrator', 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Lib',
        'scratch', '.gemini', 'brain', 'tasks', '.system_generated', '.vercel'
    }

    # 📝 Common code file extensions
    code_extensions = {
        '.py', '.js', '.css', '.json', '.xml', '.yml', '.yaml',
        '.md', '.txt', '.sql', '.sh', '.bat', '.cfg', '.ini', '.env',
        '.jsx', '.ts', '.tsx', '.vue', '.php', '.java', '.cpp', '.c',
        '.h', '.cs', '.rb', '.go', '.rs', '.swift', '.kt'
    }

    folders_count = 0
    files_count = 0
    lines_of_code = 0
    total_bytes = 0
    file_line_counts = []
    small_file_line_counts = []
    heavy_files = []
    
    # ----------------------------------------------
    # 1) Calculate Stats
    # ----------------------------------------------
    for root, dirs, files in os.walk(root_path):
        # Modify dirs in-place to prune the search tree (skip ignored folders)
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        folders_count += len(dirs)
        
        for file in files:
            if file == '__init__.py' or 'schema' in file.lower() or file == 'Project_structure.txt' or file.endswith('.pyc'):
                continue

            files_count += 1
            file_path = Path(root) / file
            
            # Add to total size
            file_size = 0
            try:
                file_size = os.path.getsize(file_path)
                total_bytes += file_size
            except Exception:
                pass

            if file_size > 100 * 1024:
                try:
                    display_name = file_path.relative_to(root_path).as_posix()
                except ValueError:
                    display_name = file_path.name
                heavy_files.append((display_name, file_size))
            
            # Count lines of code if it's considered a code file
            if file_path.suffix.lower() in code_extensions:
                file_lines = 0
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        file_lines = sum(1 for _ in f)
                except UnicodeDecodeError:
                    try:
                        with open(file_path, 'r', encoding='latin-1') as f:
                            file_lines = sum(1 for _ in f)
                    except Exception:
                        pass
                except Exception: # Ignore binary file errors, etc
                    pass
                lines_of_code += file_lines
                if file_path.suffix.lower() != '.md':
                    if 'backend/data' not in file_path.as_posix() and file_path.name != 'package-lock.json':
                        try:
                            display_name = file_path.relative_to(root_path).as_posix()
                        except ValueError:
                            display_name = file_path.name
                        if 'Z_scripts/' not in display_name and 'debug/' not in display_name and display_name != 'project_tester.py':
                            if file_lines > 300:
                                file_line_counts.append((display_name, file_lines))
                            elif file_lines < 60:
                                small_file_line_counts.append((display_name, file_lines))

    output_lines = []
    
    # ----------------------------------------------
    # 2) Build Summary Stats Output
    # ----------------------------------------------
    output_lines.append(f"Generated at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    output_lines.append(f"Root directory: {root_path.absolute()}")
    output_lines.append(f"Folders: {folders_count}")
    output_lines.append(f"Files: {files_count}")
    output_lines.append(f"Lines of code: {lines_of_code}")
    output_lines.append(f"Bytes: {total_bytes:,}")
    output_lines.append("\nStructure:")
    
    # ----------------------------------------------
    # 3) Build Directory Tree
    # ----------------------------------------------
    def build_tree(path, prefix=""):
        try:
            # Sort iterdir so directories/files show up alphabetically
            items = sorted(path.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
            
            # Filter out ignored dirs
            valid_items = []
            for item in items:
                if item.name in ignore_dirs:
                    continue
                if item.is_file() and (item.name == '__init__.py' or 'schema' in item.name.lower() or item.name == 'Project_structure.txt' or item.name.endswith('.pyc')):
                    continue
                valid_items.append(item)
                
            for i, item in enumerate(valid_items):
                is_last = (i == len(valid_items) - 1)
                current_prefix = "└── " if is_last else "├── "
                
                if item.is_dir():
                    output_lines.append(f"{prefix}{current_prefix}📁 {item.name}/")
                    next_prefix = prefix + ("    " if is_last else "│   ")
                    build_tree(item, next_prefix)
                else:
                    output_lines.append(f"{prefix}{current_prefix}📄 {item.name}")
        except PermissionError:
            output_lines.append(f"{prefix}[NO ACCESS PERMISSION]")
            
    # Print the root dir visually at the top
    output_lines.append(f"📁 {(root_path.absolute().name if root_path.absolute().name else 'Root')}/")
    build_tree(root_path)

    # ----------------------------------------------
    # Heavy Files List
    # ----------------------------------------------
    if heavy_files:
        output_lines.append("\nHeavy files (> 100 kb):")
        heavy_files.sort(key=lambda x: x[1], reverse=True)
        for fname, fsize in heavy_files:
            size_str = f"{fsize / (1024 * 1024):.2f} MB" if fsize >= 1024 * 1024 else f"{fsize / 1024:.2f} KB"
            output_lines.append(f"📄 {fname}: {size_str}")

    # ----------------------------------------------
    # 4) Large Files List
    # ----------------------------------------------
    if file_line_counts:
        output_lines.append("\nLarge Files (> 300 lines):")
        file_line_counts.sort(key=lambda x: x[1], reverse=True)
        for fname, flines in file_line_counts:
            output_lines.append(f"📄 {fname}: {flines} lines")

    # ----------------------------------------------
    # 5) Small Files List
    # ----------------------------------------------
    if small_file_line_counts:
        output_lines.append("\nSmall Files (< 60 lines):")
        small_file_line_counts.sort(key=lambda x: x[1])
        for fname, flines in small_file_line_counts:
            output_lines.append(f"📄 {fname}: {flines} lines")

    # Combine all lines
    final_output = "\n".join(output_lines)
    
    # Print to console/notebook output
    # print(final_output)

    # Write to file
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_output)
        print(f"\n[OK] Successfully saved project structure to: {output_file}")
    except Exception as e:
        print(f"\n[ERROR] Failed to write to {output_file}: {e}")

if __name__ == "__main__":
    print_project_summary(".", "Project_structure.txt")
