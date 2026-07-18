import json
import os
from pathlib import Path

MEMORY_FILE = Path(os.path.expanduser("~")) / ".aurelia_memory.json"

def load_memories() -> list[str]:
    if not MEMORY_FILE.exists():
        return []
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return [str(m) for m in data]
    except Exception:
        pass
    return []

def save_memories(memories: list[str]) -> None:
    try:
        MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(memories, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def add_memory(text: str) -> None:
    text = text.strip()
    if not text:
        return
    memories = load_memories()
    if text not in memories:
        memories.append(text)
        save_memories(memories)

def get_rag_context() -> str:
    memories = load_memories()
    if not memories:
        return "No long-term memories stored yet."
    
    formatted = []
    for idx, mem in enumerate(memories, 1):
        formatted.append(f"{idx}. {mem}")
    return "\n".join(formatted)
