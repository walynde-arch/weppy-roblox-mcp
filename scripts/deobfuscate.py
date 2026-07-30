# NovaMCP Deobfuscator - Automated variable renaming for Luau files
# Usage: python deobfuscate.py <file.luau>
# Analyzes local variables and renames single-letter vars based on context

import re
import sys
import os

def analyze_and_rename(content):
    """Analyze and rename single-letter local variables in Luau code."""
    
    # Track all changes made
    changes = []
    
    # ====== PASS 1: Module-level require/GetService patterns ======
    # Pattern: local X=game:GetService('ServiceName')
    for m in re.finditer(r'local ([a-z])=game:GetService\(([\'"])(\w+)\2\)', content):
        var = m.group(1)
        svc = m.group(3)
        old = f'local {var}=game:GetService'
        new = f'local {svc}=game:GetService'
        if old in content:
            content = content.replace(old, new, 1)
            changes.append(f"{var} → {svc} (Service)")
    
    # Pattern: local X=require(script.Path.To.Module)  
    for m in re.finditer(r'local ([a-z])=require\(([^)]+)\)', content):
        var = m.group(1)
        path = m.group(2)
        # Extract last segment of path as name
        parts = path.replace("'",'').replace('"','').split('.')
        name = parts[-1] if parts else 'module'
        # Clean name
        name = re.sub(r'[^a-zA-Z0-9_]', '', name)
        if name and name[0].islower():
            name = name[0].upper() + name[1:] if len(name) > 1 else name.upper()
        old = f'local {var}=require({path})'
        new = f'local {name}=require({path})'
        if old in content:
            content = content.replace(old, new, 1)
            changes.append(f"{var} → {name} (require)")
    
    # ====== PASS 2: Table freeze constants ======
    for m in re.finditer(r'local ([a-z])=table\.freeze\(\{', content):
        var = m.group(1)
        # Look ahead for field names
        end_idx = content.find('})', m.start())
        chunk = content[m.start():min(end_idx+2, m.start()+200)]
        # Extract field names
        fields = re.findall(r"(\w+)=", chunk)
        if fields:
            # Use first field as inspiration
            name = fields[0]
            if name.startswith('CREATE_') or name.startswith('HAS_'):
                name = name.split('_')[0].lower()
                if name == 'create': name = 'creationKinds'
                elif name == 'has': name = 'stateKinds'
                elif name == 'low': name = 'levels'
            elif name == 'EMPTY':
                name = 'stateKinds'
            else:
                name = name.lower() + 'Kinds'
        else:
            name = 'constants'
        old = f'local {var}=table.freeze'
        new = f'local {name}=table.freeze'
        if old in content:
            content = content.replace(old, new, 1)
            changes.append(f"{var} → {name} (freeze)")
    
    # ====== PASS 3: Instance.new and simple constructors ======
    for m in re.finditer(r'local ([a-z])=Instance\.new\(', content):
        var = m.group(1)
        # Infer from context
        old = f'local {var}=Instance.new'
        new = f'local newObj=Instance.new'
        if old in content:
            content = content.replace(old, new, 1)
            changes.append(f"{var} → newObj (Instance.new)")
    
    # ====== PASS 4: Module table declarations ======
    for m in re.finditer(r'\blocal ([a-z])=\{\}\1\.__index=\1\b', content):
        var = m.group(1)
        # Get the file/module name from context
        old = f'local {var}={{}}{var}.__index={var}'
        new = f'local Module={{}}Module.__index=Module'
        if old in content:
            content = content.replace(old, new, 1)
            changes.append(f"{var} → Module (class)")
    
    # ====== PASS 5: Simple value constants ======
    for m in re.finditer(r'local ([a-z])=(\d+(?:\.\d+)?)\s', content):
        var = m.group(1)
        val = m.group(2)
        # Determine name from value
        try:
            num = float(val)
            if num == num:  # not NaN
                name = 'CONSTANT_' + val.replace('.', '_')
        except:
            name = 'value'
        old = f'local {var}={val}'
        new = f'local {name}={val}'
        if old in content and len(name) > 1:
            content = content.replace(old, new, 1)
            changes.append(f"{var} → {name} (constant)")
    
    # ====== PASS 6: Loop variables ======
    # Pattern: for x,y in ipairs/pairs
    for m in re.finditer(r'for ([a-z]),([a-z])\s+in\s+(ipairs|pairs)\(', content):
        idx_var = m.group(1)
        val_var = m.group(2)
        iter_type = m.group(3)
        
        old_for = m.group(0)
        if iter_type == 'ipairs':
            new_for = old_for.replace(f'for {idx_var},{val_var} in ipairs(', f'for index,value in ipairs(')
        else:
            new_for = old_for.replace(f'for {idx_var},{val_var} in pairs(', f'for key,value in pairs(')
        
        if old_for in content:
            content = content.replace(old_for, new_for, 1)
            changes.append(f"{idx_var},{val_var} → index,value (loop)")
    
    return content, changes

def main():
    if len(sys.argv) < 2:
        print("Usage: python deobfuscate.py <file.luau>")
        return
    
    filepath = sys.argv[1]
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    before_count = len(re.findall(r'\blocal [a-z]=', content))
    print(f"Before: {before_count} single-letter locals")
    
    content, changes = analyze_and_rename(content)
    
    after_count = len(re.findall(r'\blocal [a-z]=', content))
    print(f"After: {after_count} single-letter locals")
    print(f"Changes made: {len(changes)}")
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    # Print unique changes
    unique = set(changes)
    for c in sorted(unique):
        print(f"  {c}")

if __name__ == '__main__':
    main()
