"""Zotero integration service — creates collections and uploads BibTeX items."""

import os

import httpx


class ZoteroService:
    """Interacts with the Zotero API to create collections and add items."""

    def __init__(self, api_key: str | None = None, user_id: str | None = None):
        self.api_key = api_key or os.environ.get("ZOTERO_API_KEY")
        self.user_id = user_id or os.environ.get("ZOTERO_USER_ID")
        self.base_url = "https://api.zotero.org"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.user_id)

    async def create_collection(self, collection_name: str, bibtex_entries: list[dict]) -> dict:
        """Create a Zotero collection and add items from BibTeX entries.

        Returns dict with collection_key, items_created, and errors.
        """
        if not self.is_configured:
            raise ValueError("Zotero API key and user ID must be configured")

        headers = {
            "Zotero-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

        # Step 1: Create the collection
        collection_payload = {"name": collection_name, "parentCollection": False}
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.base_url}/users/{self.user_id}/collections",
                headers=headers,
                json=collection_payload,
            )
            if resp.status_code not in (200, 201, 204):
                raise RuntimeError(f"Failed to create Zotero collection: {resp.status_code} {resp.text}")

            # Extract collection key from response
            collection_key = resp.headers.get("Last-Modified-Version", "")
            # Zotero returns the key in the response body or headers
            if resp.text:
                try:
                    body = resp.json()
                    if isinstance(body, list) and len(body) > 0:
                        collection_key = body[0].get("key", "")
                    elif isinstance(body, dict):
                        collection_key = body.get("key", "")
                except Exception:
                    pass

        # Step 2: Create items for each paper
        items_created = 0
        errors: list[str] = []
        for entry in bibtex_entries:
            zotero_item = {
                "itemType": "journalArticle",
                "title": entry.get("title", ""),
                "creators": [
                    {
                        "firstName": name.split()[0] if name else "",
                        "lastName": " ".join(name.split()[1:]) if name else "",
                        "creatorType": "author",
                    }
                    for name in entry.get("authors", [])
                ],
                "publicationTitle": entry.get("journal", ""),
                "date": str(entry.get("year", "")),
                "DOI": entry.get("doi", ""),
                "abstractNote": entry.get("abstract", ""),
                "collections": [collection_key] if collection_key else [],
            }

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.base_url}/users/{self.user_id}/items",
                    headers=headers,
                    json=zotero_item,
                )
                if resp.status_code in (200, 201, 204):
                    items_created += 1
                else:
                    errors.append(f"Failed to create item '{entry.get('title', 'unknown')}': {resp.status_code}")

        return {
            "collection_key": collection_key,
            "collection_name": collection_name,
            "items_created": items_created,
            "errors": errors,
        }
