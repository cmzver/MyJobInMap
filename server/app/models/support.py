"""
Support ticket models.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow

if TYPE_CHECKING:
    from app.models.organization import OrganizationModel
    from app.models.user import UserModel


class SupportTicketCategory(str, Enum):
    BUG = "bug"
    IMPROVEMENT = "improvement"
    FEEDBACK = "feedback"


class SupportTicketStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class SupportTicketCommentType(str, Enum):
    COMMENT = "comment"
    STATUS_CHANGE = "status_change"


class SupportTicketModel(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_created_by_id", "created_by_id"),
        Index("ix_support_tickets_category", "category"),
        Index("ix_support_tickets_status", "status"),
        Index("ix_support_tickets_organization_status", "organization_id", "status"),
        Index("ix_support_tickets_updated_at", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SupportTicketCategory.FEEDBACK.value
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SupportTicketStatus.NEW.value
    )
    admin_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("organizations.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_by: Mapped["UserModel"] = relationship(
        "UserModel",
        back_populates="support_tickets_created",
        foreign_keys=[created_by_id],
    )
    organization: Mapped[Optional["OrganizationModel"]] = relationship(
        "OrganizationModel", back_populates="support_tickets"
    )
    comments: Mapped[List["SupportTicketCommentModel"]] = relationship(
        "SupportTicketCommentModel",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="SupportTicketCommentModel.created_at.asc()",
    )


class SupportTicketCommentModel(Base):
    __tablename__ = "support_ticket_comments"
    __table_args__ = (
        Index("ix_support_ticket_comments_ticket_id", "ticket_id"),
        Index("ix_support_ticket_comments_created_at", "created_at"),
        Index("ix_support_ticket_comments_type", "comment_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("support_tickets.id"), nullable=False
    )
    author_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    comment_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SupportTicketCommentType.COMMENT.value
    )
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    old_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    new_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )

    ticket: Mapped["SupportTicketModel"] = relationship(
        "SupportTicketModel", back_populates="comments"
    )
    author: Mapped["UserModel"] = relationship(
        "UserModel",
        back_populates="support_comments_authored",
        foreign_keys=[author_id],
    )
