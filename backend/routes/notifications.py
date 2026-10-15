from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import CurrentUser, require_nurse
from database import get_db
from services import notifications

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    limit: int = Query(30, ge=1, le=200),
    unread_only: bool = False,
    user: CurrentUser = Depends(require_nurse),
    db: Session = Depends(get_db),
):
    return {"items": notifications.list_for_nurse(db, user.user_id, limit, unread_only),
            "unread_count": notifications.unread_count(db, user.user_id)}


@router.get("/unread-count")
def unread_count(user: CurrentUser = Depends(require_nurse), db: Session = Depends(get_db)):
    return {"unread_count": notifications.unread_count(db, user.user_id)}


@router.post("/read-all")
def read_all(user: CurrentUser = Depends(require_nurse), db: Session = Depends(get_db)):
    n = notifications.mark_all_read(db, user.user_id)
    return {"marked": n, "unread_count": 0}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user: CurrentUser = Depends(require_nurse), db: Session = Depends(get_db)):
    """Marks the notification read for this nurse only. Does NOT acknowledge the patient."""
    if not notifications.mark_read(db, user.user_id, notification_id):
        raise HTTPException(404, "Notification not found")
    return {"notification_id": notification_id, "is_read": True,
            "unread_count": notifications.unread_count(db, user.user_id)}
