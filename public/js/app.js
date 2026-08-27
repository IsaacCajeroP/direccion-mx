(function () {
  'use strict';

  const API_BASE = '/api';
  const CP_REGEX = /^\d{5}$/;

  const els = {
    form: document.getElementById('direccion-form'),
    cp: document.getElementById('cp'),
    cpFeedback: document.getElementById('cp-feedback'),
    estado: document.getElementById('estado'),
    municipio: document.getElementById('municipio'),
    localidad: document.getElementById('localidad'),
    colonia: document.getElementById('colonia'),
    calle: document.getElementById('calle'),
    alertContainer: document.getElementById('alert-container'),
    submitBtn: document.getElementById('submit-btn'),
  };

  // Evita que el listener "change" de Estado dispare una recarga de
  // municipios/localidades cuando lo estamos seleccionando por codigo
  // desde onCpBlur (ya que ahi cargamos esos catalogos nosotros mismos).
  let autoSelecting = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cargarEstados();
    els.estado.addEventListener('change', onEstadoChange);
    els.cp.addEventListener('blur', onCpBlur);
    els.cp.addEventListener('input', () => {
      // El usuario esta editando el CP de nuevo: ya no confiamos en la
      // resolucion previa hasta que vuelva a perder el foco.
      clearFieldError(els.cp, els.cpFeedback);
    });
    els.form.addEventListener('submit', onSubmit);
  }

  // ---------------------------------------------------------------------
  // PARTE 1 · Punto 1: cargar estados al iniciar
  // ---------------------------------------------------------------------
  async function cargarEstados() {
    setSelectLoading(els.estado, 'Cargando...');
    try {
      const estados = await getJSON(`${API_BASE}/estados`);
      fillSelect(els.estado, estados, 'clave', 'nombre_estado', 'Seleccione...');
    } catch (err) {
      fillSelect(els.estado, [], 'clave', 'nombre_estado', 'Error al cargar');
      showAlert(
        'No se pudieron cargar los estados. Verifica que el servidor y la base de datos estén disponibles.',
        'danger'
      );
    }
  }

  // ---------------------------------------------------------------------
  // PARTE 1 · Punto 2: al elegir estado, cargar municipios y localidades
  // ---------------------------------------------------------------------
  async function onEstadoChange() {
    if (autoSelecting) return;

    resetSelect(els.municipio, 'Seleccione el estado');
    resetSelect(els.localidad, 'Seleccione el municipio...');
    resetSelect(els.colonia, 'Seleccione...');

    const estadoClave = els.estado.value;
    if (!estadoClave) return;

    await cargarMunicipiosYLocalidades(estadoClave);
  }

  async function cargarMunicipiosYLocalidades(estadoClave) {
    setSelectLoading(els.municipio, 'Cargando...');
    setSelectLoading(els.localidad, 'Cargando...');
    try {
      const [municipios, localidades] = await Promise.all([
        getJSON(`${API_BASE}/municipios/${estadoClave}`),
        getJSON(`${API_BASE}/localidades/${estadoClave}`),
      ]);
      fillSelect(els.municipio, municipios, 'clave', 'descripcion', 'Seleccione...');
      fillSelect(els.localidad, localidades, 'clave', 'descripcion', 'Seleccione...');
    } catch (err) {
      resetSelect(els.municipio, 'Error al cargar');
      resetSelect(els.localidad, 'Error al cargar');
      showAlert('No se pudieron cargar los municipios y localidades del estado.', 'danger');
    }
  }

  // ---------------------------------------------------------------------
  // PARTE 2 · Puntos 3 y 4: resolver el codigo postal al perder el foco
  // ---------------------------------------------------------------------
  async function onCpBlur() {
    const cp = els.cp.value.trim();
    clearFieldError(els.cp, els.cpFeedback);

    if (!cp) return;

    if (!CP_REGEX.test(cp)) {
      setFieldError(els.cp, els.cpFeedback, 'El código postal debe tener 5 dígitos.');
      return;
    }

    setSelectLoading(els.colonia, 'Buscando...');

    try {
      const response = await fetch(`${API_BASE}/codigo-postal/${cp}`);

      if (response.status === 404) {
        setFieldError(els.cp, els.cpFeedback, 'El código postal no fue encontrado en el catálogo.');
        limpiarSeleccionDependiente();
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Selecciona el estado devuelto y carga sus municipios/localidades
      autoSelecting = true;
      els.estado.value = data.estado.clave;
      autoSelecting = false;

      await cargarMunicipiosYLocalidades(data.estado.clave);

      if (data.municipio) {
        els.municipio.value = data.municipio.clave;
      } else {
        // El catalogo no trae municipio para este CP: se deja para que
        // el usuario lo seleccione manualmente.
        els.municipio.value = '';
      }

      if (data.localidad) {
        els.localidad.value = data.localidad.clave;
      } else {
        els.localidad.value = '';
      }

      fillSelect(els.colonia, data.colonias, 'clave', 'descripcion', 'Seleccione...');
      if (data.colonias.length === 1) {
        els.colonia.value = data.colonias[0].clave;
      }
    } catch (err) {
      resetSelect(els.colonia, 'Seleccione...');
      showAlert('Ocurrió un error al consultar el código postal. Intenta de nuevo.', 'danger');
    }
  }

  function limpiarSeleccionDependiente() {
    autoSelecting = true;
    els.estado.value = '';
    autoSelecting = false;
    resetSelect(els.municipio, 'Seleccione el estado');
    resetSelect(els.localidad, 'Seleccione el municipio...');
    resetSelect(els.colonia, 'Seleccione...');
  }

  // ---------------------------------------------------------------------
  // PARTE 3 · Punto 5: validar contra los catálogos al hacer clic en Continuar
  // ---------------------------------------------------------------------
  async function onSubmit(evt) {
    evt.preventDefault();
    clearAlert();

    const campos = [els.cp, els.estado, els.municipio, els.localidad, els.colonia, els.calle];
    let faltanCampos = false;

    campos.forEach((el) => {
      if (!el.value || !el.value.toString().trim()) {
        el.classList.add('is-invalid');
        faltanCampos = true;
      } else {
        el.classList.remove('is-invalid');
      }
    });

    if (faltanCampos) {
      showAlert('Todos los campos son obligatorios. Completa la información faltante.', 'danger');
      return;
    }

    const payload = {
      cp: els.cp.value.trim(),
      estado: els.estado.value,
      municipio: els.municipio.value,
      localidad: els.localidad.value,
      colonia: els.colonia.value,
      calle: els.calle.value.trim(),
    };

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/validar-direccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.valid) {
        showAlert(data.message || 'La dirección es válida.', 'success');
      } else {
        const mensaje = (data.errors && data.errors.length)
          ? data.errors.join(' ')
          : 'La dirección no es válida.';
        showAlert(mensaje, 'danger');
      }
    } catch (err) {
      showAlert('Ocurrió un error al validar la dirección. Intenta de nuevo.', 'danger');
    } finally {
      setSubmitting(false);
    }
  }

  function setSubmitting(isSubmitting) {
    els.submitBtn.disabled = isSubmitting;
    els.submitBtn.textContent = isSubmitting ? 'Validando...' : 'Continuar';
  }

  // ---------------------------------------------------------------------
  // Helpers de UI
  // ---------------------------------------------------------------------
  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function fillSelect(select, items, valueKey, labelKey, placeholder) {
    const frag = document.createDocumentFragment();

    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = placeholder;
    frag.appendChild(optPlaceholder);

    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item[valueKey];
      opt.textContent = item[labelKey];
      frag.appendChild(opt);
    });

    select.innerHTML = '';
    select.appendChild(frag);
    select.disabled = items.length === 0;
  }

  function resetSelect(select, placeholder) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
    select.disabled = true;
  }

  function setSelectLoading(select, text) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = text;
    select.appendChild(opt);
    select.disabled = true;
  }

  function showAlert(message, type) {
    els.alertContainer.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${escapeHtml(message)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
      </div>
    `;
  }

  function clearAlert() {
    els.alertContainer.innerHTML = '';
  }

  function setFieldError(input, feedbackEl, message) {
    input.classList.add('is-invalid');
    if (feedbackEl) feedbackEl.textContent = message;
  }

  function clearFieldError(input, feedbackEl) {
    input.classList.remove('is-invalid');
    if (feedbackEl) feedbackEl.textContent = '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
