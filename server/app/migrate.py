"""One-shot database migration entry point for deploy jobs."""

from app.models.base import run_migrations


def main() -> None:
    run_migrations()


if __name__ == "__main__":
    main()
