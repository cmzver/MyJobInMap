"""
Support ticket models.
"""

from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, utcnow


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

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(20), nullable=False, default=SupportTicketCategory.FEEDBACK.value)
    status = Column(String(20), nullable=False, default=SupportTicketStatus.NEW.value)
    admin_response = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    created_by = relationship(
        "UserModel",
        back_populates="support_tickets_created",
        foreign_keys=[created_by_id],
    )
    organization = relationship("OrganizationModel", back_populates="support_tickets")
    comments = relationship(
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

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment_type = Column(String(20), nullable=False, default=SupportTicketCommentType.COMMENT.value)
    body = Column(Text, nullable=True)
    old_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    ticket = relationship("SupportTicketModel", back_populates="comments")
    author = relationship("UserModel", back_populates="support_comments_authored", foreign_keys=[author_id])
