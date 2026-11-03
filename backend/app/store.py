import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .models import Project


class ConflictError(ValueError):
    pass


class ProjectStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS projects "
                "(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS approved_scenes "
                "(project_id TEXT NOT NULL, revision INTEGER NOT NULL, approved_at TEXT, scene TEXT NOT NULL, "
                "PRIMARY KEY(project_id, revision))"
            )

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def create(self, name: str) -> Project:
        now = datetime.now(UTC).isoformat()
        project = Project(
            id=str(uuid4()), name=name.strip() or "Untitled project", created_at=now, updated_at=now
        )
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO projects VALUES (?, ?, ?)",
                (project.id, project.revision, project.model_dump_json()),
            )
        return project

    def get(self, project_id: str) -> Project:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT data FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
        if row is None:
            raise KeyError(project_id)
        return Project.model_validate_json(row[0])

    def list(self) -> list[Project]:
        with self.connect() as connection:
            rows = connection.execute("SELECT data FROM projects ORDER BY rowid DESC").fetchall()
        return [Project.model_validate_json(row[0]) for row in rows]

    def save(
        self, project: Project, expected_revision: int, *, track_history: bool = True
    ) -> Project:
        project.revision = expected_revision + 1
        project.updated_at = datetime.now(UTC).isoformat()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT data FROM projects WHERE id = ? AND revision = ?",
                (project.id, expected_revision),
            ).fetchone()
            if row is None:
                raise ConflictError(
                    "Project changed since this view loaded. Reopen it before editing."
                )
            before = Project.model_validate_json(row[0])
            if track_history:
                if (
                    project.committed_scene != before.committed_scene
                    or project.candidate_scene is None
                ):
                    project.undo_stack, project.redo_stack = [], []
                elif project.candidate_scene != before.candidate_scene:
                    project.undo_stack = [*before.undo_stack, before.candidate_scene][-20:]
                    project.redo_stack = []
                else:
                    project.undo_stack, project.redo_stack = before.undo_stack, before.redo_stack
            cursor = connection.execute(
                "UPDATE projects SET revision = ?, data = ? WHERE id = ? AND revision = ?",
                (project.revision, project.model_dump_json(), project.id, expected_revision),
            )
            if cursor.rowcount != 1:
                raise ConflictError(
                    "Project changed since this view loaded. Reopen it before editing."
                )
            if (
                project.committed_scene is not None
                and project.committed_scene != before.committed_scene
            ):
                # Preserve an existing legacy snapshot without inventing its original approval time.
                if (
                    before.committed_scene is not None
                    and not connection.execute(
                        "SELECT 1 FROM approved_scenes WHERE project_id = ? LIMIT 1", (project.id,)
                    ).fetchone()
                ):
                    connection.execute(
                        "INSERT INTO approved_scenes VALUES (?, ?, ?, ?)",
                        (
                            project.id,
                            expected_revision,
                            None,
                            before.committed_scene.model_dump_json(),
                        ),
                    )
                connection.execute(
                    "INSERT INTO approved_scenes VALUES (?, ?, ?, ?)",
                    (
                        project.id,
                        project.revision,
                        project.updated_at,
                        project.committed_scene.model_dump_json(),
                    ),
                )
        return project

    def snapshots(self, project_id: str):
        project = self.get(project_id)
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT revision, approved_at, scene FROM approved_scenes WHERE project_id = ? ORDER BY revision DESC",
                (project_id,),
            ).fetchall()
        if not rows and project.committed_scene is not None:
            return [
                {
                    "revision": project.revision,
                    "approved_at": None,
                    "scene": project.committed_scene.model_dump(),
                }
            ]
        import json

        return [
            {"revision": row[0], "approved_at": row[1], "scene": json.loads(row[2])} for row in rows
        ]
