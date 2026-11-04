const { z } = require('zod');

const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(5).max(100).refine(value => value.trim().split(/\s+/).length >= 2, 'Informe o nome completo.'),
    phone: z.string()
      .transform(value => value.replace(/\D/g, ''))
      .transform(value => (value.length === 12 || value.length === 13) && value.startsWith('55') ? value.slice(2) : value)
      .refine(value => /^\d{10,11}$/.test(value), 'Informe telefone com DDD.'),
    cep: z.string().regex(/^\d{8}$/),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(20),
    neighborhood: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().regex(/^[A-Z]{2}$/),
    whatsappOptIn: z.boolean().default(false),
    residenceType: z.enum(['Casa', 'Apartamento']),
    complement: z.string().trim().max(120).optional().default(''),
    reference: z.string().trim().max(160).optional().default('')
  }),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(20),
    addons: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    options: z.array(z.number().int().positive()).max(4).default([])
  }).superRefine((item, context) => {
    if (new Set(item.options).size !== item.options.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'As opções escolhidas precisam ser diferentes.' });
    }
  })).min(1).max(30),
  payment: z.discriminatedUnion('method', [
    z.object({ method: z.literal('cash'), changeFor: z.number().positive().optional() }),
    z.object({
      method: z.literal('mercadopago'),
      paymentType: z.enum(['credit_card', 'debit_card', 'pix'])
    })
  ])
});

module.exports = { orderSchema };
