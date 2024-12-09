from typing import Dict, List, Optional
from datetime import datetime
import logging
import json
import os

logger = logging.getLogger(__name__)

class KnowledgeBase:
    def __init__(self, storage_path: str = "../data/knowledge_base"):
        self.storage_path = storage_path
        self.entries: Dict[str, Dict] = {}
        self._ensure_storage_exists()
        logger.info("Knowledge Base initialized")

    def _ensure_storage_exists(self) -> None:
        """Ensure the storage directory exists."""
        os.makedirs(self.storage_path, exist_ok=True)

    def add_entry(self, topic: str, content: Dict) -> str:
        """
        Add a new entry to the knowledge base.
        
        Args:
            topic: The topic category for the entry
            content: The content to store
            
        Returns:
            The ID of the new entry
        """
        entry_id = f"{topic}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.entries[entry_id] = {
            "topic": topic,
            "content": content,
            "created_at": datetime.now().isoformat(),
            "last_modified": datetime.now().isoformat()
        }
        self._save_entry(entry_id)
        logger.info(f"Added new knowledge base entry: {entry_id}")
        return entry_id

    def get_entry(self, entry_id: str) -> Optional[Dict]:
        """
        Retrieve an entry from the knowledge base.
        
        Args:
            entry_id: The ID of the entry to retrieve
            
        Returns:
            The entry if found, None otherwise
        """
        return self.entries.get(entry_id)

    def update_entry(self, entry_id: str, content: Dict) -> bool:
        """
        Update an existing entry in the knowledge base.
        
        Args:
            entry_id: The ID of the entry to update
            content: The new content
            
        Returns:
            True if successful, False otherwise
        """
        if entry_id not in self.entries:
            return False
        
        self.entries[entry_id]["content"] = content
        self.entries[entry_id]["last_modified"] = datetime.now().isoformat()
        self._save_entry(entry_id)
        logger.info(f"Updated knowledge base entry: {entry_id}")
        return True

    def search(self, query: str) -> List[Dict]:
        """
        Search the knowledge base for relevant entries.
        
        Args:
            query: The search query
            
        Returns:
            List of matching entries
        """
        # TODO: Implement proper search logic
        results = []
        for entry_id, entry in self.entries.items():
            if query.lower() in str(entry["content"]).lower():
                results.append({"id": entry_id, **entry})
        return results

    def _save_entry(self, entry_id: str) -> None:
        """Save an entry to persistent storage."""
        file_path = os.path.join(self.storage_path, f"{entry_id}.json")
        with open(file_path, 'w') as f:
            json.dump(self.entries[entry_id], f, indent=2)

    def _load_entry(self, entry_id: str) -> Optional[Dict]:
        """Load an entry from persistent storage."""
        file_path = os.path.join(self.storage_path, f"{entry_id}.json")
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return None
