-- Datos sintéticos para probar migraciones. Nunca datos reales de clientes.
INSERT INTO public.restaurante (id, nombre, slug) OVERRIDING SYSTEM VALUE
VALUES (9001, 'Restaurante A', 'test-a'), (9002, 'Restaurante B', 'test-b');

INSERT INTO public.local_memberships (user_id, restaurante_id, rol) VALUES
  ('00000000-0000-0000-0000-00000000000a', 9001, 'viewer'),
  ('00000000-0000-0000-0000-00000000000b', 9002, 'owner');

INSERT INTO public.rol (restaurante_id, code, nombre) VALUES (9002, 'cajero', 'Cajero');

INSERT INTO public.pedidos (restaurante_id, telefono) VALUES (9001, '+34600000001'), (9002, '+34600000002');
