const ventaService = require('./ventas.service');
const logger = require('../../utils/logger');

class VentaController {
  /**
   * CREAR RESERVA FORMAL
   * POST /ventas/reservar
   * Bloquea boletas por varios días, vinculadas a un cliente
   */
  async crearReserva(req, res) {
    try {
      const reservaData = {
        ...req.body,
        reservada_por: req.user.id
      };

      const reserva = await ventaService.crearReservaFormal(reservaData);

      res.status(201).json({
        success: true,
        message: 'Reserva formal creada exitosamente',
        data: reserva
      });
    } catch (error) {
      logger.error('Error in crearReserva controller:', error);

      if (error.message.includes('Rifa no encontrada')) {
        return res.status(404).json({
          success: false,
          message: 'Rifa no encontrada'
        });
      }

      if (error.message.includes('no existe en esta rifa') || error.message.includes('no está disponible')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creando reserva',
        error: error.message
      });
    }
  }

  /**
   * CONVERTIR RESERVA EN VENTA
   * POST /ventas/:id/convertir-reserva
   * Transforma reserva (PENDIENTE, monto=0) en venta (PAGADA/ABONADA)
   */
  async convertirReserva(req, res) {
    try {
      const { id } = req.params;
      const { monto_total, total_pagado, medio_pago_id } = req.body;

      if (!monto_total || monto_total <= 0) {
        return res.status(400).json({
          success: false,
          message: 'monto_total es requerido y debe ser mayor a 0'
        });
      }

      if (!total_pagado || total_pagado <= 0) {
        return res.status(400).json({
          success: false,
          message: 'total_pagado es requerido y debe ser mayor a 0'
        });
      }

      if (total_pagado > monto_total) {
        return res.status(400).json({
          success: false,
          message: 'total_pagado no puede ser mayor a monto_total'
        });
      }

      const venta = await ventaService.convertirReservaEnVenta(id, {
        monto_total,
        total_pagado,
        medio_pago_id
      });

      res.json({
        success: true,
        message: 'Reserva convertida a venta exitosamente',
        data: venta
      });
    } catch (error) {
      logger.error('Error in convertirReserva controller:', error);

      if (error.message.includes('Reserva no encontrada')) {
        return res.status(404).json({
          success: false,
          message: 'Reserva no encontrada o no está en estado PENDIENTE'
        });
      }

      if (error.message.includes('Medio de pago')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error convirtiendo reserva',
        error: error.message
      });
    }
  }

  /**
   * CANCELAR RESERVA
   * POST /ventas/:id/cancelar-reserva
   * Borra la reserva y libera todas las boletas
   */
  async cancelarReserva(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;

      const resultado = await ventaService.cancelarReserva(id, motivo);

      res.json({
        success: true,
        message: 'Reserva cancelada exitosamente',
        data: resultado
      });
    } catch (error) {
      logger.error('Error in cancelarReserva controller:', error);

      if (error.message.includes('Reserva no encontrada')) {
        return res.status(404).json({
          success: false,
          message: 'Reserva no encontrada o no está en estado PENDIENTE'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error cancelando reserva',
        error: error.message
      });
    }
  }

  async createVenta(req, res) {
    try {
      const ventaData = {
        ...req.body,
        vendida_por: req.user.id
      };
      
      const venta = await ventaService.createVenta(ventaData);
      
      res.status(201).json({
        success: true,
        message: 'Venta created successfully',
        data: venta
      });
    } catch (error) {
      logger.error('Error in createVenta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating venta',
        error: error.message
      });
    }
  }

  async getAllVentas(req, res) {
    try {
      const ventas = await ventaService.getAllVentas();
      
      res.json({
        success: true,
        message: 'Ventas retrieved successfully',
        data: ventas
      });
    } catch (error) {
      logger.error('Error in getAllVentas controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving ventas',
        error: error.message
      });
    }
  }

  async getVentasByRifa(req, res) {
    try {
      const { rifa_id } = req.params;
      const ventas = await ventaService.getVentasByRifa(rifa_id);
      
      res.json({
        success: true,
        message: 'Ventas retrieved successfully',
        data: ventas
      });
    } catch (error) {
      logger.error('Error in getVentasByRifa controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving ventas',
        error: error.message
      });
    }
  }

  async getMyVentas(req, res) {
    try {
      const ventas = await ventaService.getVentasByVendedor(req.user.id);
      
      res.json({
        success: true,
        message: 'My ventas retrieved successfully',
        data: ventas
      });
    } catch (error) {
      logger.error('Error in getMyVentas controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving ventas',
        error: error.message
      });
    }
  }

  async getVentaById(req, res) {
    try {
      const { id } = req.params;
      const venta = await ventaService.getVentaById(id);
      
      res.json({
        success: true,
        message: 'Venta retrieved successfully',
        data: venta
      });
    } catch (error) {
      logger.error('Error in getVentaById controller:', error);
      
      if (error.message === 'Venta not found') {
        return res.status(404).json({
          success: false,
          message: 'Venta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error retrieving venta',
        error: error.message
      });
    }
  }

  async updateVenta(req, res) {
    try {
      const { id } = req.params;
      const ventaData = req.body;
      
      const venta = await ventaService.updateVenta(id, ventaData, req.user.id);
      
      res.json({
        success: true,
        message: 'Venta updated successfully',
        data: venta
      });
    } catch (error) {
      logger.error('Error in updateVenta controller:', error);
      
      if (error.message === 'Venta not found') {
        return res.status(404).json({
          success: false,
          message: 'Venta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating venta',
        error: error.message
      });
    }
  }

  async completeVenta(req, res) {
    try {
      const { id } = req.params;
      const venta = await ventaService.completeVenta(id, req.user.id);
      
      res.json({
        success: true,
        message: 'Venta completed successfully',
        data: venta
      });
    } catch (error) {
      logger.error('Error in completeVenta controller:', error);
      
      if (error.message === 'Venta not found') {
        return res.status(404).json({
          success: false,
          message: 'Venta not found'
        });
      }
      
      if (error.message === 'Venta cannot be completed') {
        return res.status(400).json({
          success: false,
          message: 'Venta cannot be completed'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error completing venta',
        error: error.message
      });
    }
  }

  async cancelVenta(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      
      const venta = await ventaService.cancelVenta(id, motivo, req.user.id);
      
      res.json({
        success: true,
        message: 'Venta cancelled successfully',
        data: venta
      });
    } catch (error) {
      logger.error('Error in cancelVenta controller:', error);
      
      if (error.message === 'Venta not found') {
        return res.status(404).json({
          success: false,
          message: 'Venta not found'
        });
      }
      
      if (error.message === 'Completed venta cannot be cancelled') {
        return res.status(400).json({
          success: false,
          message: 'Completed venta cannot be cancelled'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error cancelling venta',
        error: error.message
      });
    }
  }

  async deleteVenta(req, res) {
    try {
      const { id } = req.params;
      const venta = await ventaService.deleteVenta(id);
      
      res.json({
        success: true,
        message: 'Venta deleted successfully',
        data: venta
      });
    } catch (error) {
      logger.error('Error in deleteVenta controller:', error);
      
      if (error.message === 'Venta not found') {
        return res.status(404).json({
          success: false,
          message: 'Venta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error deleting venta',
        error: error.message
      });
    }
  }

  async getVentasStats(req, res) {
    try {
      const { rifa_id } = req.params;
      const stats = await ventaService.getVentasStats(rifa_id);
      
      res.json({
        success: true,
        message: 'Ventas stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getVentasStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving ventas stats',
        error: error.message
      });
    }
  }

  async getMyStats(req, res) {
    try {
      const stats = await ventaService.getVentasStatsByVendedor(req.user.id);
      
      res.json({
        success: true,
        message: 'My ventas stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getMyStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving ventas stats',
        error: error.message
      });
    }
  }

  async getVentasByDateRange(req, res) {
    try {
      const { fecha_inicio, fecha_fin } = req.query;
      const ventas = await ventaService.getVentasByDateRange(fecha_inicio, fecha_fin);
      
      res.json({
        success: true,
        message: 'Ventas retrieved successfully',
        data: ventas
      });
    } catch (error) {
      logger.error('Error in getVentasByDateRange controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving ventas',
        error: error.message
      });
    }
  }

async getVentaDetalleFinanciero(req, res) {
  try {
    const { id } = req.params;
    const data = await ventaService.getVentaDetalleFinanciero(id);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async getVentasPorCliente(req, res) {
  try {
    const { clienteId } = req.params;
    const ventas = await ventaService.getVentasPorCliente(clienteId);

    res.json({
      success: true,
      data: ventas
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
  


async registrarAbono(req, res) {
  try {
    const { id } = req.params;
    const { monto, metodo_pago, notas } = req.body;

    if (!monto || monto <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto es requerido y debe ser mayor a 0'
      });
    }

    // Mapeo metodo_pago (string del front) → medio_pago_id (UUID de tabla medios_pago)
    const metodoPagoMap = {
      efectivo: 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7',      // Efectivo
      nequi: 'af6e15fc-c52c-4491-abe1-20243af301c4',        // Nequi
      transferencia: 'db94562d-bb01-42a3-9414-6e369a1a70ba', // PSE
      daviplata: 'af6e15fc-c52c-4491-abe1-20243af301c4',   // Sin Daviplata en BD → Nequi
      otro: 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7'         // Otro → Efectivo
    };

    const medioPagoId = metodoPagoMap[metodo_pago] || metodoPagoMap.efectivo;

    const venta = await ventaService.registrarAbonoVenta(
      id,
      Number(monto),
      medioPagoId,
      'COP',
      req.user.id,
      notas
    );

    res.json({
      success: true,
      message: 'Abono registrado exitosamente',
      data: venta
    });
  } catch (error) {
    logger.error('Error in registrarAbono controller:', error);

    if (error.message === 'Venta no encontrada') {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }

    if (
      error.message === 'La venta ya está pagada' ||
      error.message === 'El monto excede el saldo pendiente' ||
      error.message === 'La venta no tiene boletas asociadas'
    ) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error registrando abono',
      error: error.message
    });
  }
}

}



module.exports = new VentaController();
