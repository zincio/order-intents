import { z } from 'zod';

// Schema for variant specifics (size, color, etc.)
export const VariantSpecificSchema = z.object({
  dimension: z.string(),
  value: z.string()
});

// Schema for product variants
export const ProductVariantSchema = z.object({
  variant_specifics: z.array(VariantSpecificSchema),
  product_id: z.string()
});

// Schema for package dimensions
export const PackageDimensionsSchema = z.object({
  weight: z.object({
    amount: z.number(),
    unit: z.string()
  }),
  size: z.object({
    width: z.object({
      amount: z.number(),
      unit: z.string()
    }),
    depth: z.object({
      amount: z.number(),
      unit: z.string()
    }),
    length: z.object({
      amount: z.number(),
      unit: z.string()
    })
  })
});

// Schema for EPIDs (External Product Identifiers)
export const EpidSchema = z.object({
  type: z.string(),
  value: z.string()
});

// Main product schema
export const ProductSchema = z.object({
  status: z.enum(['completed', 'error', 'loading']),
  original_retail_price: z.number().optional(),
  timestamp: z.number().optional(),
  all_variants: z.array(ProductVariantSchema).optional(),
  retailer: z.string().optional(),
  feature_bullets: z.array(z.string()).optional(),
  variant_specifics: z.array(VariantSpecificSchema).optional(),
  main_image: z.string().optional(),
  images: z.array(z.string()).optional(),
  package_dimensions: PackageDimensionsSchema.optional(),
  epids: z.array(EpidSchema).optional(),
  product_id: z.string().optional(),
  asin: z.string().optional(),
  ship_price: z.number().optional(),
  categories: z.array(z.string()).optional(),
  review_count: z.number().optional(),
  epids_map: z.record(z.string()).optional(),
  title: z.string().optional(),
  brand: z.string().optional(),
  product_description: z.union([z.string(), z.array(z.string())]).optional(),
  product_details: z.array(z.string()).optional(),
  question_count: z.number().optional(),
  stars: z.number().optional(),
  fresh: z.boolean().optional(),
  pantry: z.boolean().optional(),
  handmade: z.boolean().optional(),
  digital: z.boolean().optional(),
  buyapi_hint: z.boolean().optional(),
  price: z.number().optional(),
  error: z.string().optional()
});

export type Product = z.infer<typeof ProductSchema>;
export type VariantSpecific = z.infer<typeof VariantSpecificSchema>;
export type ProductVariant = z.infer<typeof ProductVariantSchema>;
export type PackageDimensions = z.infer<typeof PackageDimensionsSchema>;
export type Epid = z.infer<typeof EpidSchema>; 