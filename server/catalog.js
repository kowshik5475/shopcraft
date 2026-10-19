export function publicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    price: Number(product.priceCents != null ? product.priceCents / 100 : product.price),
    category: typeof product.category === "string" ? product.category : product.category?.name || "",
    description: product.description,
    imageUrl: product.imageUrl,
    stock: product.stock,
    rating: product.rating,
    reviewCount: product.reviewCount,
    badge: product.badge || null,
    featured: product.featured,
  };
}

export function toCents(value) {
  return Math.round(Number(value) * 100);
}
