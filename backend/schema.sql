create table if not exists users (
  id bigserial primary key,
  username text not null unique,
  password text not null,
  role text not null default 'sales' check (role in ('admin', 'warehouse', 'sales')),
  allowed_pages text[] not null default array['inventory-view'],
  created_at timestamptz not null default now()
);

create table if not exists products (
  id bigserial primary key,
  part_number text not null unique,
  description text not null,
  category text not null,
  status varchar(20) not null default 'Active' check (status in ('Active', 'Inactive')),
  current_quantity integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id bigserial primary key,
  operation_type text not null check (operation_type in ('Add Stock', 'Remove Stock', 'Adjustment')),
  stock_card_no text,
  adjustment_reason text,
  part_number text not null references products(part_number) on update cascade,
  quantity integer not null check (quantity >= 0),
  location text,
  stock_status_type text not null check (stock_status_type in ('Available', 'Reserved', 'Pending PO', 'Modify', 'Sold', 'Showroom Unit', 'Warranty Replacement', 'Returned Stock', 'Damaged Stock')),
  shipment text,
  poc_key_in text,
  remark text,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_part_number on products(part_number);
create index if not exists idx_products_category on products(category);
create index if not exists idx_stock_movements_part_number on stock_movements(part_number);
create index if not exists idx_stock_movements_created_at on stock_movements(created_at);

-- Optional first admin user. Change the password immediately after logging in.
-- insert into users (username, password, role, allowed_pages)
-- values ('admin', 'ChangeMe123!', 'admin', array['dashboard', 'product-master', 'stock-entry', 'inventory-view', 'user-management'])
-- on conflict (username) do nothing;
