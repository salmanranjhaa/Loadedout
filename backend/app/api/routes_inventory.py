from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.inventory import InventoryItem

router = APIRouter(prefix="/inventory", tags=["inventory"])

VALID_CATEGORIES = {"protein", "carbs", "veggies", "dairy", "spices", "fats", "other"}
VALID_UNITS = {"g", "kg", "pieces", "tbsp", "tsp", "cups", "L", "ml", "cans", "portions"}


class InventoryItemCreate(BaseModel):
    name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = "other"
    expiry_date: Optional[date] = None


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expiry_date: Optional[date] = None


@router.get("/")
@limiter.limit("100/minute")
async def get_inventory(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I return all inventory items grouped by category."""
    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.user_id == user["sub"])
        .order_by(InventoryItem.category, InventoryItem.name)
    )
    items = result.scalars().all()
    return {"items": [_fmt(i) for i in items]}


@router.post("/")
@limiter.limit("30/minute")
async def add_inventory_item(
    request: Request,
    item: InventoryItemCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I add a new item to the inventory."""
    new_item = InventoryItem(
        user_id=user["sub"],
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        category=item.category if item.category in VALID_CATEGORIES else "other",
        expiry_date=item.expiry_date,
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return _fmt(new_item)


@router.put("/{item_id}")
@limiter.limit("30/minute")
async def update_inventory_item(
    request: Request,
    item_id: int,
    updates: InventoryItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I update an existing inventory item (e.g. change quantity after shopping)."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.user_id == user["sub"],
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if updates.name is not None:
        item.name = updates.name
    if updates.quantity is not None:
        item.quantity = updates.quantity
    if updates.unit is not None:
        item.unit = updates.unit
    if updates.category is not None:
        item.category = updates.category if updates.category in VALID_CATEGORIES else "other"
    if updates.expiry_date is not None:
        item.expiry_date = updates.expiry_date

    await db.commit()
    await db.refresh(item)
    return _fmt(item)


@router.delete("/{item_id}")
@limiter.limit("30/minute")
async def delete_inventory_item(
    request: Request,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """I remove an item from the inventory."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.user_id == user["sub"],
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
    return {"deleted": item_id}


def _days_until_expiry(expiry: Optional[date]) -> Optional[int]:
    if expiry is None:
        return None
    return (expiry - date.today()).days


def _fmt(i: InventoryItem) -> dict:
    return {
        "id": i.id,
        "name": i.name,
        "quantity": i.quantity,
        "unit": i.unit,
        "category": i.category or "other",
        "expiry_date": i.expiry_date.isoformat() if i.expiry_date else None,
        "days_until_expiry": _days_until_expiry(i.expiry_date),
    }
